"use client";

import { useMemo, useState } from "react";
import { distinctStationSites, type AdminSite, type AdminSiteType, type AdminStation, type AdminSubtype } from "../lib/admin-view";
import { downloadAdminInventory } from "../lib/admin-export";
import { getAllowedSiteSubtypes } from "../lib/site-subtypes";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

export default function AdminBulkExport({ stations, sites, siteTypes, subtypes, onMessage }: {
  stations: AdminStation[];
  sites: AdminSite[];
  siteTypes: AdminSiteType[];
  subtypes: AdminSubtype[];
  onMessage: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stationId, setStationId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteSubtypeId, setSiteSubtypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const stationSites = useMemo(() => stationId ? distinctStationSites(stationId, sites) : [], [stationId, sites]);
  const selectedSite = stationSites.find((site) => site.id === siteId);
  const selectedSiteType = siteTypes.find((siteType) => siteType.id === selectedSite?.site_type_id);
  const subtypeOptions = selectedSite && selectedSiteType ? getAllowedSiteSubtypes({
    siteName: selectedSite.name,
    siteTypeName: selectedSiteType.name,
    siteSubtypes: subtypes.filter((subtype) => subtype.site_type_id === selectedSite.site_type_id),
    getSubtypeName: (subtype) => subtype.name,
  }) : [];

  async function download() {
    const client = getSupabaseBrowserClient();
    const station = stations.find((row) => row.id === stationId);
    if (!client || !station) return;
    setBusy(true);
    onMessage("");
    try {
      const result = await downloadAdminInventory({
        client,
        scope: {
          stationId,
          siteId: siteId || undefined,
          siteSubtypeId: siteId && siteSubtypeId ? siteSubtypeId : undefined,
        },
      });
      onMessage(`${result.filename} selesai: ${result.fileCount} CSV (${result.existingCount} sudah ada data, ${result.emptyCount} default).`);
      setOpen(false);
    } catch (error) {
      onMessage(error instanceof Error ? `Bulk download gagal: ${error.message}` : "Bulk download gagal.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="secondary-button" onClick={() => setOpen(true)}>Bulk Download</button>
    {open && <div className="credential-dialog-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) setOpen(false); }}>
      <section className="credential-dialog bulk-export-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-export-title">
        <div className="credential-dialog-heading">
          <div><p className="eyebrow">EXPORT ADMIN</p><h2 id="bulk-export-title">Bulk Download</h2></div>
          <button type="button" disabled={busy} onClick={() => setOpen(false)}>Tutup</button>
        </div>
        <div className="form-stack">
          <label>Stasiun
            <select value={stationId} onChange={(event) => { setStationId(event.target.value); setSiteId(""); setSiteSubtypeId(""); }}>
              <option value="">Pilih stasiun</option>
              {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
            </select>
          </label>
          <label>Site
            <select disabled={!stationId} value={siteId} onChange={(event) => { setSiteId(event.target.value); setSiteSubtypeId(""); }}>
              <option value="">Semua Site</option>
              {stationSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label>Subtipe
            <select disabled={!siteId || !subtypeOptions.length} value={siteSubtypeId} onChange={(event) => setSiteSubtypeId(event.target.value)}>
              <option value="">Semua Subtipe</option>
              {subtypeOptions.map((subtype) => <option key={subtype.id} value={subtype.id}>{subtype.name}</option>)}
            </select>
          </label>
        </div>
        {selectedSite && !subtypeOptions.length && <p className="warning-copy">Variant atau subtipe Site ini belum terpetakan dan tidak dapat diekspor.</p>}
        <div className="credential-dialog-actions">
          <button className="primary-button" disabled={!stationId || busy || Boolean(siteId && !subtypeOptions.length)} onClick={() => void download()}>
            {busy ? "Menyiapkan..." : siteId && siteSubtypeId ? "Unduh CSV" : "Unduh ZIP"}
          </button>
        </div>
      </section>
    </div>}
  </>;
}
