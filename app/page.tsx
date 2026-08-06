import type { Metadata } from "next";
import InventoryApp from "./InventoryApp";

export const metadata: Metadata = {
  title: "IRM Collect — Inventaris Barang Terpasang",
  description: "Prototipe lokal pendataan barang terpasang per stasiun dan site.",
};

export default function Home() {
  return <InventoryApp />;
}
