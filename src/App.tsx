// PROTOTYPE MOUNT (issue #5): the home page currently hosts the add-flow
// prototype — three interaction-contract variants switchable via ?variant=
// (A|B|C). Throwaway: replace with the real app shell once the add-flow
// contract is settled. See src/prototype/add-flow/.
import { AddFlowPrototype } from "@/prototype/add-flow"

export function App() {
  return <AddFlowPrototype />
}

export default App
