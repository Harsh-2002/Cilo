import { parentPort, workerData } from "node:worker_threads";
import { renderToString } from "react-dom/server";
import { PublicationDocument } from "../src/components/publication-document";

parentPort?.postMessage(
  renderToString(<PublicationDocument {...workerData} />),
);
