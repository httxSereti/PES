import type { Route } from "../pages/+types/home";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
  return [
    { title: "PES" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  return (
    <div className="home">
      <h1 >Home</h1>
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">Button</button>
    </div>
  );
}