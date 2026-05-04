# Config & Data — Frontend

Read by client and server. Tree-shaken on the client side — only referenced data ships.

Common imports in components:
```ts
import { Z_INDEX } from "@/constants/z-index";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { membershipPackages } from "@/data/membershipPackages";
```
