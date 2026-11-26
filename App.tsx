import "./src/fonts";
import { horizontalSizeClass, mount, View } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { CenterHeader } from "./src/components/CenterHeader";
import { Composer } from "./src/components/Composer";
import { Inspector } from "./src/components/Inspector";
import { SettingsScreen } from "./src/components/Settings";
import { Sidebar } from "./src/components/Sidebar";
import { Transcript } from "./src/components/Transcript";
import { boot, settingsOpen, sidebarOpen } from "./src/store";

function Workbench() {
  const isRegular = () => horizontalSizeClass() === "regular";
  return (
    <View class="relative h-full w-full flex-row overflow-hidden bg-background">
      <If when={isRegular()}>
        <Sidebar />
      </If>
      <View class="h-full min-w-0 flex-1 bg-background">
        <CenterHeader />
        <Transcript />
        <Composer />
      </View>
      <If when={isRegular()}>
        <Inspector />
      </If>
      <If when={!isRegular() && sidebarOpen()}>
        <View class="absolute inset-0 z-20 flex-row">
          <Sidebar compact />
          <BaseButton
            class="flex-1 bg-black/40"
            accessibilityLabel="Close sessions sidebar"
            onPress={() => sidebarOpen.set(false)}
          />
        </View>
      </If>
    </View>
  );
}

function App() {
  // Components run once in NSH; boot is idempotent and owned by the store.
  queueMicrotask(() => void boot());
  return (
    <View class="h-full w-full overflow-hidden bg-background">
      <If when={settingsOpen()} else={<Workbench />}>
        <SettingsScreen />
      </If>
    </View>
  );
}

mount(App);
