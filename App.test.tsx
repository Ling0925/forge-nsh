import { expect, open, test } from "nsh/test";

test("renders the workbench shell", async () => {
  const app = await open("./App.tsx");
  expect(app.texts()).toContain("Forge NSH");
  expect(app.texts()).toContain("New session");
  expect(app.texts()).toContain("What should Forge work on?");
  expect(app.texts()).toContain("Inspector");
});
