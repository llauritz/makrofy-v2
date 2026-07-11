import { AddCard } from "./AddCard"
import { EntryList } from "./EntryList"
import { Header } from "./Header"
import { ENTRIES } from "./mock"
import { SummaryCard } from "./SummaryCard"
import { WeekStrip } from "./WeekStrip"

// Main screen (spec § Product): header · week strip · add card · entry list ·
// floating summary. Static mock state until the store (#14) and slice (#15).
export function MainScreen() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col">
      <Header />
      <main className="flex flex-1 flex-col">
        <WeekStrip />
        <AddCard />
        <EntryList entries={ENTRIES} />
        <div className="flex-1" />
        <SummaryCard />
      </main>
    </div>
  )
}
