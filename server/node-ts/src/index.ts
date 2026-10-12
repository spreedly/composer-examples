import cors from "cors";
import * as dotenv from "dotenv";
import express, { ErrorRequestHandler, Request, Response } from "express";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.options("*", cors());

const port = process.env.PORT || 3020;

import { Composer, ComposerApiVersion, VERSION as sdkVersion } from "@spreedly/composer-sdk-server";
import { ICheckpointOptions } from "@spreedly/composer-sdk-server/dist/types/types";
import { getIp } from "./helpers";
import {
  IExecuteCheckpointParams,
  IProcessCheckpointApiParams,
  IProcessCheckpointResult,
  IProcessServerEventApiParams,
  IProcessServerEventResult,
} from "./interfaces";

const SDK_PACKAGE = "@spreedly/composer-sdk-server";
const MISSING_CONFIG_MESSAGE =
  "Missing DODGEBALL_SECRET_KEY; copy .env.example to .env (SPREEDLY_SECRET_KEY also accepted)";
const SDK_META = {
  language: "node",
  package: SDK_PACKAGE,
  version: sdkVersion,
};

const envOr = (primary: string, fallback: string): string | undefined => {
  const primaryValue = process.env[primary];
  if (primaryValue) {
    return primaryValue;
  }
  return process.env[fallback];
};

const secretKey = envOr("DODGEBALL_SECRET_KEY", "SPREEDLY_SECRET_KEY") ?? "UNSET_SECRET_KEY";
const apiUrl = envOr("DODGEBALL_API_URL", "SPREEDLY_API_URL");

// Initialize the SDK with your secret API key.
const composer = new Composer(secretKey, {
  apiVersion: ComposerApiVersion.v1,
  apiUrl: apiUrl ?? undefined,
});

const isApiKeyConfigured = (): boolean => {
  return Boolean(secretKey) && secretKey !== "UNSET_SECRET_KEY";
};

const INVALID_JSON_BODY = "Invalid request: body must be valid JSON";
const INVALID_CHECKPOINT_BODY = "Invalid checkpoint request: body must be JSON with a non-empty checkpointName string";

const isInvalidCheckpointBody = (body: unknown): boolean => {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return true;
  }
  const name = (body as { checkpointName?: unknown }).checkpointName;
  return typeof name !== "string" || name.trim() === "";
};

if (!isApiKeyConfigured()) {
  console.warn(MISSING_CONFIG_MESSAGE);
}

app.get("/", (req: Request, res: Response) => {
  res.send("Index Page");
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, sdk: SDK_META });
});

app.get("/meta", (_req: Request, res: Response) => {
  res.status(200).json(SDK_META);
});

const executeCheckpoint = async (
  params: IExecuteCheckpointParams,
  // The IP address of the device making the request
  // You can use the request object (for example an Express.js requeest) to get the IP address
  ipAddress: string,
  // (Optional if you have a valid sourceToken) Unique identifier for the session
  sessionId?: string,
  // (Optional) Unique identifier for the user, used to track the user's risk profile
  userId?: string
): Promise<IProcessCheckpointResult> => {
  try {
    const checkpointPayload: ICheckpointOptions = {
      checkpointName: params.checkpointName,
      event: {
        ip: ipAddress,
        data: {
          ...(params.payload ?? {}),
          exampleValueFromBackendOnly: "EXAMPLE_VALUE",
        },
      },
    };
    if (params.sourceToken) {
      checkpointPayload.sourceToken = params.sourceToken;
    }
    if (sessionId) {
      checkpointPayload.sessionId = sessionId;
    }
    if (userId) {
      checkpointPayload.userId = userId;
    }
    if (params.verificationId) {
      checkpointPayload.useVerificationId = params.verificationId;
    }
    const checkpointResponse = await composer.checkpoint(checkpointPayload);

    // Handle the response from the checkpoint
    if (composer.isAllowed(checkpointResponse)) {
      // Proceed with placing the order
      return {
        success: true,
        status: "isAllowed",
        verification: checkpointResponse.verification,
      };
    } else if (composer.isRunning(checkpointResponse)) {
      // If the outcome is pending, send the verification to the frontend to do additional checks (such as MFA, KYC)
      return {
        success: true,
        status: "isRunning",
        verification: checkpointResponse.verification,
      };
    } else if (composer.isDenied(checkpointResponse)) {
      // If the request is denied, you can return the verification to the frontend to display a reason message
      return {
        success: true,
        status: "isDenied",
        verification: checkpointResponse.verification,
      };
    } else {
      // If the checkpoint failed, decide how you would like to proceed. You can return the error, choose to proceed, retry, or reject the request.
      return {
        success: true,
        status: "isError",
        verification: checkpointResponse.verification,
        errorMessage: JSON.stringify(checkpointResponse.errors),
      };
    }
  } catch (error) {
    // Handle any errors that occur during the checkpoint execution, usually configuration related
    let errorMessage = "Invocation error, likely configuration";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return {
      success: false,
      status: "isError",
      verification: null,
      errorMessage,
    };
  }
};

app.post("/checkpoint", async (req: Request, res: Response) => {
  // Production deployments must not log full request or response bodies.
  console.log("\n(POST /checkpoint)");
  if (isInvalidCheckpointBody(req.body)) {
    return res.status(400).json({ error: INVALID_CHECKPOINT_BODY });
  }
  if (!isApiKeyConfigured()) {
    return res.status(200).json({
      success: false,
      status: "isError",
      verification: null,
      errorMessage: MISSING_CONFIG_MESSAGE,
    });
  }
  try {
    // In moments of risk, call a checkpoint to verify the request is allowed to proceed
    const requestBody: IProcessCheckpointApiParams = req.body;
    const requestIp = getIp(req);
    console.log("CHECKPOINT", requestBody.checkpointName);
    const executionResult = await executeCheckpoint(
      {
        checkpointName: requestBody.checkpointName,
        payload: requestBody.payload,
        sourceToken: requestBody.sourceToken,
        verificationId: requestBody.verificationId,
      },
      requestIp,
      // You can choose to use the session id from the request body, or override it here
      // The session id is only required if you do not have a source token
      requestBody.sessionId,
      // You can choose to use the user id from the request body, or override it here
      // The user id optional, but can be used to track the user's risk profile
      requestBody.userId
    );
    console.log("CHECKPOINT RESULT", requestBody.checkpointName, executionResult.status);
    return res.status(200).json(executionResult);
  } catch (error) {
    // Any error that gets here is unexpected
    // Most checkpoint errors will be handled by executeCheckpoint and get a 200 response
    console.error("CHECKPOINT ERROR", error);
    return res.status(500).json({
      success: false,
      status: "isError",
      errorMessage: error instanceof Error ? error.message : "Error at /checkpoint",
    });
  }
});

const sendServerEvent = async (
  params: IProcessServerEventApiParams
): Promise<IProcessServerEventResult> => {
  try {
    await composer.event({
      // The source token is required to send an event
      sourceToken: params.sourceToken,
      // You can choose to use the session id from the request body, or override it here
      // The session id optional, but can be used to help identify the session
      sessionId: params.sessionId,
      // You can choose to use the user id from the request body, or override it here
      // The user id optional, but can be used to track the user's risk profile
      userId: params.userId,
      event: {
        type: params.eventName,
        data: params.payload,
        eventTime: Date.now(),
      },
    });
    return { success: true };
  } catch (error) {
    // Handle any errors that occur during the event execution, usually configuration related
    let errorMessage = "Error sending event, likely configuration";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { success: false, errorMessage };
  }
};

app.post("/event", async (req, res) => {
  // Production deployments must not log full request or response bodies.
  console.log("\n(POST /event)");
  try {
    const requestBody: IProcessServerEventApiParams = req.body;
    console.log("EVENT", requestBody.eventName);
    const executionResult = await sendServerEvent(requestBody);
    console.log("EVENT RESULT", requestBody.eventName, executionResult.success ? "ok" : "error");
    return res.status(200).json(executionResult);
  } catch (error) {
    // Any error that gets here is unexpected
    // Most event errors will be handled by sendServerEvent and get a 200 response
    console.error("SEND SERVER EVENT ERROR", error);
    return res.status(500).json({ success: false, errorMessage: "Error at /event" });
  }
});

const jsonParseErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: INVALID_JSON_BODY });
    return;
  }
  next(err);
};

app.use(jsonParseErrorHandler);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
