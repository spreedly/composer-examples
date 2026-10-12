"use client";
import { nanoid } from "nanoid";
import { FC } from "react";
import { useCheckpointStateContext } from "../contexts/CheckpointStateProvider";
import { useComposerProvider } from "../contexts/ComposerProvider";
export const UserSelector: FC = () => {
  const { currentCheckpointState, updateCheckpointState, addMessage } = useCheckpointStateContext();
  const { clientSdk } = useComposerProvider();
  const initialUserId = currentCheckpointState.userId ?? "";
  const initialSessionId = currentCheckpointState.sessionId ?? "";

  const getNewUserSession = () => {
    const newUserId = `user-${nanoid()}`;
    const newSessionId = `session-${nanoid()}`;
    return { newUserId, newSessionId };
  };

  const setNewUserSession = (newUserId: string, newSessionId: string) => {
    updateCheckpointState({
      userId: newUserId,
      sessionId: newSessionId,
    });
    if (newUserId && newSessionId) {
      clientSdk?.track(newSessionId, newUserId);
      addMessage(`Trust Client SDK track called with sessionId: "${newSessionId}" and userId: "${newUserId}"`);
    }
    if (!newUserId) {
      clientSdk?.track(newSessionId);
      addMessage(`Trust Client SDK track called with sessionId: "${newSessionId}"`);
    }
    if (!newSessionId) {
      addMessage("No session ID provided - Trust Client SDK track not called");
    }
  };

  const getNewAnonymousUserSession = () => {
    const newSessionId = `anon-session-${nanoid()}`;
    const newUserId = "";
    return { newUserId, newSessionId };
  };

  const handleNewUserClick = () => {
    const { newUserId, newSessionId } = getNewUserSession();
    setNewUserSession(newUserId, newSessionId);
  };

  const handleNewAnonymousSessionClick = () => {
    const { newUserId, newSessionId } = getNewAnonymousUserSession();
    setNewUserSession(newUserId, newSessionId);
  };

  const handleUserIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUserId = event.target.value;
    setNewUserSession(newUserId, currentCheckpointState.sessionId ?? "");
  };

  const handleSessionIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSessionId = event.target.value;
    setNewUserSession(currentCheckpointState.userId ?? "", newSessionId);
  };

  return (
    <div>
      <div className="user-selector-title">Select a User and Session Option:</div>
      <div className="user-item-container">
        <label>
          <div className="field-label">Use a Custom User:</div>
          <input 
            onChange={handleUserIdChange} 
            className="field-text-input" 
            type="text" 
            id="user-id-input" 
            placeholder="Enter a specific User ID" 
            value={initialUserId}
          />
        </label>
      </div>
      <div className="user-item-container">
          <div className="session-selector-title">Choose a Session ID</div>
          <input 
            onChange={handleSessionIdChange}
            className="field-text-input"
            type="text"
            id="session-id-input"
            placeholder="Enter Session ID"
            value={initialSessionId} 
          />
          <div className="add-button-container">
            <button onClick={handleNewAnonymousSessionClick} id="new-anonymous-session-btn">New Anonymous Session</button>
          </div>
      </div>
      <div className="add-button-container"><button onClick={handleNewUserClick} id="new-user-btn">New User</button></div>
    </div>
  )
};
