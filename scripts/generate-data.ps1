param(
  [string]$InputRoot = '',
  [string]$GeneratedOutput = ''
)

$ErrorActionPreference = 'Stop'

$sourceRoot = if ($InputRoot) { $InputRoot } else { Split-Path -Parent $PSScriptRoot | Split-Path -Parent }
$outputPath = if ($GeneratedOutput) { $GeneratedOutput } else { Join-Path (Split-Path -Parent $PSScriptRoot) 'app\data.generated.json' }

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
$productCategoryRows = Import-SourceCsv '*product_categories.csv'
$productRows = Import-SourceCsv '*products.csv'

function Add-OptionalText([System.Collections.Specialized.OrderedDictionary]$target, [object]$row, [string]$sourceName, [string]$targetName) {
  $property = $row.PSObject.Properties[$sourceName]
  if ($property -and $null -ne $property.Value) {
    $value = $property.Value.ToString().Trim()
    if ($value) { $target[$targetName] = $value }
  }
}

function Add-OptionalBoolean([System.Collections.Specialized.OrderedDictionary]$target, [object]$row, [string]$sourceName, [string]$targetName) {
  $property = $row.PSObject.Properties[$sourceName]
  if (-not $property -or $null -eq $property.Value -or -not $property.Value.ToString().Trim()) { return }
  $value = $property.Value.ToString().Trim().ToLowerInvariant()
  if ($value -in @('true', '1', 'ya', 'aktif')) { $target[$targetName] = $true; return }
  if ($value -in @('false', '0', 'tidak', 'nonaktif')) { $target[$targetName] = $false; return }
  throw "Nilai $sourceName harus TRUE atau FALSE: $($property.Value)"
}

$stationEntries = @($stationRows | ForEach-Object {
  $entry = [ordered]@{
    station = $_.'Nama Stasiun'.Trim()
    site = $_.'Nama Site'.Trim()
    siteType = $_.'Tipe Site'.Trim()
  }
  Add-OptionalText $entry $_ 'station_id' 'stationId'
  Add-OptionalBoolean $entry $_ 'station_active' 'stationActive'
  Add-OptionalText $entry $_ 'site_id' 'siteId'
  Add-OptionalBoolean $entry $_ 'site_active' 'siteActive'
  Add-OptionalText $entry $_ 'site_type_id' 'siteTypeId'
  Add-OptionalBoolean $entry $_ 'site_type_active' 'siteTypeActive'
  $entry
})

$seenStationSites = @{}
$stations = @($stationEntries | Where-Object {
  $key = if ($_.siteId) { $_.siteId } else { "$($_.station)$([char]31)$($_.site)$([char]31)$($_.siteType)" }
  if (-not $seenStationSites.ContainsKey($key)) {
    $seenStationSites[$key] = $_
    return $true
  }
  $existing = $seenStationSites[$key]
  if ($existing.station -ne $_.station -or $existing.site -ne $_.site -or $existing.siteType -ne $_.siteType) {
    throw "UUID Site dipakai oleh identitas berbeda: $key"
  }
  return $false
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

function Resolve-BarangProfile([string]$subtype) {
  if ($barangByJenis.Contains($subtype)) {
    return $subtype
  }
  if (-not $subtype.StartsWith('AWOS Kategori III')) {
    return ''
  }
  if ($subtype.EndsWith('End Point')) { return 'AWOS End Point' }
  if ($subtype.EndsWith('Station')) { return 'AWOS Station' }
  if ($subtype.EndsWith('TDZ')) { return 'AWOS TDZ' }
  if ($subtype.EndsWith('Mid')) { return 'AWOS Mid' }
  return ''
}

$siteSubtypes = @($siteSubtypeRows | ForEach-Object {
  $siteType = $_.'Tipe Site'.Trim()
  $subtype = $_.'Sub Tipe Site'.Trim()
  $explicitProfile = if ($_.PSObject.Properties['Profil Barang']) { $_.'Profil Barang'.Trim() } else { '' }
  $profile = if ($explicitProfile) { $explicitProfile } else { Resolve-BarangProfile $subtype }
  if ($profile -and -not $barangByJenis.Contains($profile)) {
    throw "Profil Barang tidak ditemukan untuk subtipe ${subtype}: $profile"
  }
  $entry = [ordered]@{
    siteType = $siteType
    subtype = $subtype
    profile = $profile
  }
  Add-OptionalText $entry $_ 'site_type_id' 'siteTypeId'
  Add-OptionalBoolean $entry $_ 'site_type_active' 'siteTypeActive'
  Add-OptionalText $entry $_ 'site_subtype_id' 'subtypeId'
  Add-OptionalBoolean $entry $_ 'site_subtype_active' 'subtypeActive'
  Add-OptionalText $entry $_ 'item_profile_id' 'profileId'
  $entry
})

$usedSiteTypes = @($stations.siteType | Sort-Object -Unique)
foreach ($siteType in $usedSiteTypes) {
  $matchingSubtypes = @($siteSubtypes | Where-Object { $_.siteType -eq $siteType })
  if (-not $matchingSubtypes.Count) {
    throw "Tipe site aktif belum mempunyai subtipe: $siteType"
  }
  foreach ($mapping in $matchingSubtypes) {
    if (-not $mapping.profile -or -not $barangByJenis.Contains($mapping.profile)) {
      throw "Subtipe site aktif belum mempunyai profil Barang: $($mapping.subtype)"
    }
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
  $entry = [ordered]@{ brand = $brand; model = $model }
  Add-OptionalText $entry $row 'product_id' 'productId'
  Add-OptionalBoolean $entry $row 'active' 'active'
  $products.Add($entry)
}

$profileItemMappings = @($barangRows | ForEach-Object {
  $entry = [ordered]@{
    profile = $_.Jenis.Trim()
    item = $_.'Barang Terpasang'.Trim()
  }
  Add-OptionalText $entry $_ 'item_profile_id' 'profileId'
  Add-OptionalBoolean $entry $_ 'item_profile_active' 'profileActive'
  Add-OptionalText $entry $_ 'item_id' 'itemId'
  Add-OptionalBoolean $entry $_ 'item_active' 'itemActive'
  Add-OptionalText $entry $_ 'profile_item_id' 'mappingId'
  Add-OptionalBoolean $entry $_ 'mapping_active' 'mappingActive'
  $entry
})

$seenCategories = @{}
$productCategories = [System.Collections.Generic.List[object]]::new()
foreach ($row in $productCategoryRows) {
  $name = $row.product_categories.Trim()
  if (-not $name) { continue }
  $key = $name.ToLowerInvariant()
  if ($seenCategories.ContainsKey($key)) { continue }
  $seenCategories[$key] = $true
  $entry = [ordered]@{ name = $name }
  Add-OptionalText $entry $row 'product_category_id' 'categoryId'
  Add-OptionalBoolean $entry $row 'active' 'active'
  $productCategories.Add($entry)
}

$hasMasterIds = [bool](
  $barangRows[0].PSObject.Properties['item_profile_id'] -or
  $productCategoryRows[0].PSObject.Properties['product_category_id']
)

$payload = [ordered]@{
  stationSites = $stations
  siteSubtypes = $siteSubtypes
  barangByJenis = $barangByJenis
  products = @($products | Sort-Object @{ Expression = { $_.brand } }, @{ Expression = { $_.model } })
}
if ($hasMasterIds) {
  $payload['master'] = [ordered]@{
    profileItems = $profileItemMappings
    productCategories = @($productCategories | Sort-Object @{ Expression = { $_.name } })
  }
}

$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outputPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $outputPath"
