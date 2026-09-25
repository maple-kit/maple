import { Counter } from "./counter";
import { Projects } from "./projects";

export default function Page() {
  return (
    <main>
      <h1>Maple example</h1>
      <p>This paragraph is tagged on a preview build and on no other.</p>
      <Projects />
      <Counter />
    </main>
  );
}
