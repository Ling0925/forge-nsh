import { horizontalSizeClass, mount, View } from "nsh";
import { CenterHeader } from "./src/components/CenterHeader";
import { Composer } from "./src/components/Composer";
import { Inspector } from "./src/components/Inspector";
import { Sidebar } from "./src/components/Sidebar";
import { Transcript } from "./src/components/Transcript";
import { boot } from "./src/store";

function App() {
  // Components run once in NSH; boot is idempotent and owned by the store.
  queueMicrotask(() => void boot());
  return (
    <View class="h-full w-full flex-row overflow-hidden bg-background">
      <Sidebar />
      <View class="h-full min-w-0 flex-1 bg-background">
        <CenterHeader />
        <Transcript />
        <Composer />
      </View>
      <If when={horizontalSizeClass() === "regular"}>
        <Inspector />
      </If>
    </View>
  );
}

mount(App);
