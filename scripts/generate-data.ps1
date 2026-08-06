$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
$outputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'app\data.generated.json'

function Import-SourceCsv([string]$pattern) {
  $file = Get-ChildItem -LiteralPath $sourceRoot -File | Where-Object Name -Like $pattern | Select-Object -First 1
  if (-not $file) {
    throw "CSV tidak ditemukan: $pattern"
  }
  return @(Import-Csv -LiteralPath $file.FullName)
}

$stationRows = Import-SourceCsv '*Nama Stasiun.csv'
$siteSubtypeRows = Import-SourceCsv '*Jenis Site.csv'
$barangRows = Import-SourceCsv '*Barang.csv'
$productRows = Import-SourceCsv '*products.csv'

$stations = @($stationRows | ForEach-Object {
  [ordered]@{
    station = $_.'Nama Stasiun'.Trim()
    site = $_.'Nama Site'.Trim()
    siteType = $_.'Tipe Site'.Trim()
  }
})

$siteSubtypes = @($siteSubtypeRows | ForEach-Object {
  [ordered]@{
    siteType = $_.'Tipe Site'.Trim()
    subtype = $_.'Sub Tipe Site'.Trim()
  }
})

$barangByJenis = [ordered]@{}
foreach ($row in $barangRows) {
  $jenis = $row.Jenis.Trim()
  $barang = $row.'Barang Terpasang'.Trim()
  if (-not $barangByJenis.Contains($jenis)) {
    $barangByJenis[$jenis] = [System.Collections.Generic.List[string]]::new()
  }
  if (-not $barangByJenis[$jenis].Contains($barang)) {
    $barangByJenis[$jenis].Add($barang)
  }
}

$seenProducts = @{}
$products = [System.Collections.Generic.List[object]]::new()
foreach ($row in $productRows) {
  $brand = if ($null -eq $row.Merk) { '' } else { $row.Merk.Trim() }
  $model = if ($null -eq $row.Tipe) { '' } else { $row.Tipe.Trim() }
  if (-not $brand -or -not $model) { continue }
  $key = ($brand + [char]31 + $model).ToLowerInvariant()
  if ($seenProducts.ContainsKey($key)) { continue }
  $seenProducts[$key] = $true
  $products.Add([ordered]@{ brand = $brand; model = $model })
}

$payload = [ordered]@{
  stationSites = $stations
  siteSubtypes = $siteSubtypes
  barangByJenis = $barangByJenis
  products = @($products | Sort-Object @{ Expression = { $_.brand } }, @{ Expression = { $_.model } })
}

$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outputPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $outputPath"
