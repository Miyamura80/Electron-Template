import { Chat } from "./components/Chat";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateNotification } from "./components/UpdateNotification";

function App() {
    return (
        <ErrorBoundary>
            <UpdateNotification />
            <Chat />
        </ErrorBoundary>
    );
}

export default App;
