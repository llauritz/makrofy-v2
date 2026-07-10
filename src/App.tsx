// PROTOTYPE MOUNT (issue #7): the home page currently hosts the stats
// prototype — three variants switchable via ?variant= (A|B|C). Throwaway:
// replace with the real app shell once the stat set and placement are
// settled. See src/prototype/stats/.
import { StatsPrototype } from "@/prototype/stats"

export function App() {
  return <StatsPrototype />
}

export default App
