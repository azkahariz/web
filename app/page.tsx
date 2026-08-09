import type { Metadata } from "next";
import InventoryApp from "./InventoryApp";

export const metadata: Metadata = {
  title: "Aloptama Collect | Pendataan Aloptama",
  description: "Pendataan Metadata dan Inventaris Aloptama",
};

export default function Home() {
  return <InventoryApp />;
}
