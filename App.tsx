import { horizontalSizeClass, mount, View } from "nsh";
import { CenterHeader } from "./src/components/CenterHeader";
import { Composer } from "./src/components/Composer";
import { Inspector } from "./src/components/Inspector";
import { Sidebar } from "./src/components/Sidebar";
import { Transcript } from "./src/components/Transcript";
import { boot } from "./src/store";
import { colors } from "./src/theme";

function App() {
  // Components run once in NSH; boot is idempotent and owned by the store.
  queueMicrotask(() => void boot());
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        flexDirection: "row",
        overflow: "hidden",
        backgroundColor: colors.canvas,
      }}
    >
      <Sidebar />
      <View style={{ flex: 1, minWidth: 0, height: "100%", backgroundColor: colors.canvas }}>
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
