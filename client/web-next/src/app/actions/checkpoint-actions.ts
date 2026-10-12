import { Dodgeball } from "@dodgeball/trust-sdk-client";
import { IVerification } from "@dodgeball/trust-sdk-client/dist/types/types";
import { MessageColor } from "../contexts/CheckpointStateProvider";

export interface IProcessServerEventApiParams {
  // Name of the event to be processed
  eventName: string;
  // Data sent from the client side to the server
  // This structure will depend on the event being processed and the handling of the data on the backend
  payload: Record<string, unknown>;
  // You can pass in a Session ID here, or set it on the backend in order to label the session
  // with your own identifier
  sessionId?: string;
  // You can pass in a User ID here, or set it on the backend in order to label the user
  // with your own identifier
  userId?: string;
  // (SET AUTOMATICALLY) Obtained from the Trust Client SDK, represents the device making the request.
  // Source Tokens can only be used if they were recently generated as they expire
  sourceToken?: string;
}

export interface IProcessServerEventResult {
  // Did the event process successfully?
  success: boolean;
}

const onFailSubmitEvent = (addMessage: (message: string, color: MessageColor) => void) => {
  addMessage("onFailSubmitEvent called", MessageColor.RED);
};

const onSuccessSubmitEvent = (addMessage: (message: string, color: MessageColor) => void) => {
  addMessage("onSuccessSubmitEvent called", MessageColor.GREEN);
};

export const sendServerEvent = async (
  clientSdk: Dodgeball | null | undefined,
  addMessage: (message: string, color: MessageColor) => void,
  apiParams: IProcessServerEventApiParams
) => {
  if (!clientSdk) {
    throw new Error("Trust Client SDK not initialized");
  }
  const sourceToken = await clientSdk.getSourceToken();

  const headers = new Headers();
  headers.append("Content-Type", "application/json");

  if (sourceToken) {
    apiParams["sourceToken"] = sourceToken;
  }

  const fetchConfig: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(apiParams),
  };
  const endpointResponse = await fetch("http://localhost:3020/event", fetchConfig);
  const responseData: IProcessServerEventResult = await endpointResponse.json();

  if (!endpointResponse.ok || !responseData.success) {
    onFailSubmitEvent(addMessage);
  } else {
    onSuccessSubmitEvent(addMessage);
  }
};

export interface IProcessCheckpointApiParams {
  checkpointName: string;
  payload: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  sourceToken?: string;
  verificationId?: string;
}

interface IProcessCheckpointResult {
  success: boolean;
  status: string;
  verification: IVerification | null;
  errorMessage?: string;
}

const onCheckpointError = (
  addMessage: (message: string, color: MessageColor) => void,
  verification: IVerification | null,
  message: string
) => {
  console.log("onCheckpointError called", verification, message);
  addMessage("onCheckpointError called with message: " + JSON.stringify(message), MessageColor.RED);
};

const onCheckpointApproved = (
  addMessage: (message: string, color: MessageColor) => void,
  verification: IVerification
) => {
  console.log("onCheckpointApproved called", verification);
  addMessage("onCheckpointApproved called", MessageColor.GREEN);
};

const onCheckpointDenied = (
  addMessage: (message: string, color: MessageColor) => void,
  verification: IVerification
) => {
  console.log("onCheckpointDenied called", verification);
  addMessage("onCheckpointDenied called", MessageColor.RED);
};

export const processCheckpoint = async (
  clientSdk: Dodgeball | null | undefined,
  addMessage: (message: string, color?: MessageColor) => void,
  apiParams: IProcessCheckpointApiParams,
  previousVerificationId: string | null = null
) => {
  try {
    if (!clientSdk) {
      throw new Error("Trust Client SDK not initialized");
    }
    const sourceToken = await clientSdk.getSourceToken();

    const headers = new Headers();
    headers.append("Content-Type", "application/json");

    if (sourceToken) {
      apiParams["sourceToken"] = sourceToken;
    }
    if (previousVerificationId) {
      apiParams["verificationId"] = previousVerificationId;
    }

    const fetchConfig: RequestInit = {
      method: "POST",
      headers,
      body: JSON.stringify(apiParams),
    };
    const endpointResponse = await fetch("http://localhost:3020/checkpoint", fetchConfig);
    const responseData: IProcessCheckpointResult = await endpointResponse.json();

    const verification = responseData.verification;
    if (!verification) {
      throw new Error("No verification object returned from the endpoint");
    }

    if (verification.stepData?.customMessage) {
      try {
        addMessage(
          "Received custom message...\n" + JSON.stringify(JSON.parse(verification.stepData.customMessage), null, 2),
          MessageColor.YELLOW
        );
      } catch (err) {
        addMessage("Received custom message...\n" + verification.stepData.customMessage, MessageColor.YELLOW);
      }
    }

    clientSdk.handleVerification(verification, {
      onVerified: async (verification) => {
        addMessage(`Checkpoint verification ${verification.id} received, processing next step`, MessageColor.BLUE);
        await processCheckpoint(clientSdk, addMessage, apiParams, verification.id);
      },
      onApproved: async (verification) => {
        onCheckpointApproved(addMessage, verification);
      },
      onDenied: async (verification) => {
        onCheckpointDenied(addMessage, verification);
      },
      onError: async (error) => {
        let errorMessage = "No Details Provided";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        onCheckpointError(addMessage, verification, "Checkpoint received error status: " + errorMessage);
      },
    });
  } catch (error) {
    let errorMessage = "Unknown Error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    onCheckpointError(addMessage, null, "An error occurred while processing the checkpoint: " + errorMessage);
  }
};
