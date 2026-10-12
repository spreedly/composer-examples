import { CheckpointOrEventForm } from "./components/checkpoint-or-event-form";
import { MessagesContainer } from "./components/messages-container";
import { PageHeader } from "./components/page-header";
import { StateViewer } from "./components/state-viewer";
import { SubmitButton } from "./components/submit-button";
import { UserSelector } from "./components/user-selector";
import { envOr } from "./env";

export default function Home() {
  const apiUrl = envOr("NEXT_PUBLIC_DODGEBALL_API_URL", "NEXT_PUBLIC_SPREEDLY_API_URL");

  return (
    <div>
      <PageHeader apiUrl={apiUrl ?? "Default"} />
      <div className="container">
        <div className="left-column">
        <CheckpointOrEventForm />
        </div>
        <div className="right-column">
          <UserSelector />
        </div>
    </div>
    <div className="container">
      <SubmitButton />
    </div>
    <div className="container">
      <MessagesContainer />
    </div>
      <div className="container">
        <StateViewer />
      </div>
    </div>
  );
}
