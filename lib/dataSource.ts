// Picks the data source. Set NEXT_PUBLIC_DEMO=1 to try the app with
// made-up arrival times and no API key.

import { demoSource } from "./demo/demoSource";
import { liveSource } from "./liveSource";
import type { DataSource } from "./types";

export const dataSource: DataSource = process.env.NEXT_PUBLIC_DEMO === "1" ? demoSource : liveSource;
