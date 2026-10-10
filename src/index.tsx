import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";

import "./index.css";
import MapViewerApp from "./mapviewer/MapViewerApp";

window.wallpaperPropertyListener = {
    applyGeneralProperties: (properties: any) => {
        if (properties.fps) {
            window.wallpaperFpsLimit = properties.fps;
        }
    },
};

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    // <React.StrictMode>
    <BrowserRouter>
        <MapViewerApp />
    </BrowserRouter>,
    // </React.StrictMode>,
);
