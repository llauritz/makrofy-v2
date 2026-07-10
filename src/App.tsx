// PROTOTYPE MOUNT (issue #4): the home page currently hosts the visual-design-direction
// prototype — three variants switchable via ?variant= (A|B|C). Throwaway: replace with
// the real app shell once a direction is chosen. See src/prototype/design-directions/.
import { DesignDirectionsPrototype } from "@/prototype/design-directions"

export function App() {
  return <DesignDirectionsPrototype />
}

export default App
