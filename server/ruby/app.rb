# frozen_string_literal: true

require 'json'
require 'ipaddr'
require 'dotenv/load'
require 'sinatra'
require 'composer'

set :port, ENV.fetch('PORT', '3023').to_i
set :bind, ENV.fetch('HOST', '127.0.0.1')

def env_or(primary, fallback)
  primary_value = ENV[primary].to_s
  return primary_value unless primary_value.empty?

  ENV[fallback].to_s
end

config = { api_version: Composer::ApiVersion::V1 }
api_url = env_or('DODGEBALL_API_URL', 'SPREEDLY_API_URL')
config[:api_url] = api_url unless api_url.empty?

secret_key = env_or('DODGEBALL_SECRET_KEY', 'SPREEDLY_SECRET_KEY')
secret_key = 'UNSET_SECRET_KEY' if secret_key.empty?

client = Composer::ComposerClient.new(secret_key, config)

SDK_META = {
  language: 'ruby',
  package: 'spreedly-composer-sdk-server',
  version: Composer::VERSION
}.freeze

MISSING_CONFIG_MESSAGE =
  'Missing DODGEBALL_SECRET_KEY; copy .env.example to .env (SPREEDLY_SECRET_KEY also accepted)'
# Failures are logged server-side; the client only gets this generic message.
CHECKPOINT_ERROR_MESSAGE = 'Checkpoint request failed'
INVALID_CHECKPOINT_BODY = 'Invalid checkpoint request: body must be JSON with a non-empty checkpointName string'

def api_key_configured?
  api_key = env_or('DODGEBALL_SECRET_KEY', 'SPREEDLY_SECRET_KEY')
  !api_key.empty? && api_key != 'UNSET_SECRET_KEY'
end

warn MISSING_CONFIG_MESSAGE unless api_key_configured?

def verification_to_hash(verification)
  return nil unless verification

  raw_step_data = verification.step_data
  step_data = raw_step_data.is_a?(Hash) ? raw_step_data : {}

  {
    id: verification.id,
    status: verification.status,
    outcome: verification.outcome,
    step_data: step_data
  }
end

def errors_to_json(errors)
  (errors || []).map { |error| { code: error.code, message: error.message } }.to_json
end

# Client IP for the risk engine. Callers must not choose this value.
# Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
# Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
def request_ip
  raw = ENV['TRUSTED_PROXY_COUNT']
  raw = '0' if raw.nil? || raw.empty?
  begin
    hops = Integer(raw)
  rescue ArgumentError
    hops = -1
  end
  raise 'Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count' if hops < 0

  parts = (request.env['HTTP_X_FORWARDED_FOR'] || '').split(',').map(&:strip)
  candidate = if hops == 0
                request.env['REMOTE_ADDR']
              elsif hops <= parts.length
                parts[parts.length - hops]
              end

  raise IPAddr::Error if candidate.nil? || candidate.include?('/')
  IPAddr.new(candidate)
  candidate
rescue IPAddr::Error
  raise 'Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT'
end

get '/healthz' do
  content_type :json
  { ok: true, sdk: SDK_META }.to_json
end

get '/meta' do
  content_type :json
  SDK_META.to_json
end

post '/checkpoint' do
  content_type :json

  begin
    body = JSON.parse(request.body.read)
  rescue JSON::ParserError
    halt 400, { error: INVALID_CHECKPOINT_BODY }.to_json
  end

  name = body.is_a?(Hash) ? body['checkpointName'] : nil
  unless name.is_a?(String) && !name.strip.empty?
    halt 400, { error: INVALID_CHECKPOINT_BODY }.to_json
  end

  unless api_key_configured?
    return {
      success: false,
      status: 'isError',
      verification: nil,
      errorMessage: MISSING_CONFIG_MESSAGE
    }.to_json
  end

  begin
    ip = request_ip
  rescue StandardError => e
    warn "client IP error: #{e.message}"
    halt 500, {
      success: false,
      status: 'isError',
      verification: nil,
      errorMessage: CHECKPOINT_ERROR_MESSAGE
    }.to_json
  end

  begin
    event = Composer::CheckpointEvent.new(
      ip: ip,
      data: (body['payload'] || {}).merge('exampleValueFromBackendOnly' => 'EXAMPLE_VALUE')
    )

    response = client.checkpoint(
      checkpoint_name: body['checkpointName'],
      event: event,
      session_id: body['sessionId'],
      user_id: body['userId'],
      source_token: body['sourceToken'],
      use_verification_id: body['verificationId']
    )

    verification = verification_to_hash(response.verification)

    if client.allowed?(response)
      status = 'isAllowed'
    elsif client.running?(response)
      status = 'isRunning'
    elsif client.denied?(response)
      status = 'isDenied'
    else
      status = 'isError'
    end

    result = { success: true, status: status, verification: verification }
    if status == 'isError'
      result[:errorMessage] = errors_to_json(response.errors)
    end
    result.to_json
  rescue StandardError => e
    warn "checkpoint error: #{e.full_message}"
    {
      success: false,
      status: 'isError',
      verification: nil,
      errorMessage: CHECKPOINT_ERROR_MESSAGE
    }.to_json
  end
end
