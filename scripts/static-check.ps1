# Static sanity checks for the cafe app (no Node/Python available in this sandbox).
#
#   1. Brace / bracket / paren balance, using a lexer that understands strings,
#      template literals (including ${ } interpolation), comments and regex.
#   2. Every named import from a local '@/lib/*' or relative module resolves to a
#      real export in that module (following `export ... from` re-exports).
#   3. Every table referenced by lib/db.ts exists in supabase/schema.sql.
#   4. Every className token used in the components we touched has a CSS rule.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script:failed = 0

function Get-Text([string]$path) { [IO.File]::ReadAllText($path) }

# When set, template literal *text* is preserved (only comments and normal
# strings are blanked). Needed by the table check, whose SQL lives in backticks.
$script:keepTemplates = $false

function Get-SourceFiles {
  $skip = @('node_modules', '.next', '.git')
  Get-ChildItem -Path $root -Recurse -File -Include *.ts, *.tsx, *.mjs, *.css |
    Where-Object { $rel = $_.FullName.Substring($root.Length); -not ($skip | Where-Object { $rel -like "*\$_\*" -or $rel.StartsWith("\$_\") }) }
}

function Get-Rel([string]$path) { $path.Substring($root.Length).TrimStart('\').Replace('\', '/') }

function ConvertTo-BlankedCode([string]$src) {
  $out = $src.ToCharArray()
  $n = $src.Length
  $i = 0
  $prev = ''

  function Blank([int]$a, [int]$b) {
    for ($k = $a; $k -lt $b -and $k -lt $n; $k++) { if ($out[$k] -ne "`n") { $out[$k] = ' ' } }
  }

  while ($i -lt $n) {
    $c = $src[$i]

    if ($c -eq '/' -and $i + 1 -lt $n -and $src[$i + 1] -eq '/') {
      $j = $src.IndexOf("`n", $i); if ($j -lt 0) { $j = $n }
      Blank $i $j; $i = $j; continue
    }
    if ($c -eq '/' -and $i + 1 -lt $n -and $src[$i + 1] -eq '*') {
      $j = $src.IndexOf('*/', $i + 2); if ($j -lt 0) { $j = $n } else { $j += 2 }
      Blank $i $j; $i = $j; continue
    }
    if ($c -eq "'" -or $c -eq '"') {
      $j = $i + 1
      while ($j -lt $n) {
        if ($src[$j] -eq '\') { $j += 2; continue }
        if ($src[$j] -eq $c -or $src[$j] -eq "`n") { $j++; break }
        $j++
      }
      Blank $i $j; $i = $j; $prev = 'str'; continue
    }
    if ($c -eq '`') {
      $j = $i + 1
      while ($j -lt $n) {
        if ($src[$j] -eq '\') { if (-not $script:keepTemplates) { $out[$j] = ' ' }; if ($j + 1 -lt $n -and -not $script:keepTemplates) { $out[$j + 1] = ' ' }; $j += 2; continue }
        if ($src[$j] -eq '`') { $j++; break }
        if ($src[$j] -eq '$' -and $j + 1 -lt $n -and $src[$j + 1] -eq '{') {
          $depth = 1; $k = $j + 2
          while ($k -lt $n -and $depth -gt 0) {
            if ($src[$k] -eq '{') { $depth++ } elseif ($src[$k] -eq '}') { $depth-- }
            $k++
          }
          $j = $k; continue
        }
        if (-not $script:keepTemplates -and $src[$j] -ne "`n") { $out[$j] = ' ' }
        $j++
      }
      if ($script:keepTemplates) {
        $out[$i] = ' '
        if ($j - 1 -ge 0 -and $j - 1 -lt $n -and $src[$j - 1] -eq '`') { $out[$j - 1] = ' ' }
      } else {
        Blank $i ([Math]::Min($j, $n))
      }
      $i = $j; $prev = 'str'; continue
    }
    if ($c -eq '/' -and ($prev -eq '' -or $prev -eq 'op' -or $prev -eq '(')) {
      $j = $i + 1; $inClass = $false; $closed = $false
      while ($j -lt $n) {
        if ($src[$j] -eq '\') { $j += 2; continue }
        if ($src[$j] -eq '[') { $inClass = $true }
        elseif ($src[$j] -eq ']') { $inClass = $false }
        elseif ($src[$j] -eq '/' -and -not $inClass) { $j++; $closed = $true; break }
        elseif ($src[$j] -eq "`n") { break }
        $j++
      }
      if ($closed) { Blank $i $j; $i = $j; $prev = 'str'; continue }
    }
    if (-not [char]::IsWhiteSpace($c)) {
      $prev = if ('=(,:[!&|?+-*/%<>~^'.Contains($c)) { 'op' } else { [string]$c }
    }
    $i++
  }
  -join $out
}

function Test-Balance {
  Write-Output '=== 1. brace / paren / bracket balance ==='
  $bad = 0
  foreach ($f in Get-SourceFiles) {
    $code = ConvertTo-BlankedCode (Get-Text $f.FullName)
    foreach ($pair in @(@('{', '}'), @('(', ')'), @('[', ']'))) {
      $a = ([regex]::Matches($code, [regex]::Escape($pair[0]))).Count
      $b = ([regex]::Matches($code, [regex]::Escape($pair[1]))).Count
      if ($a -ne $b) { Write-Output ("  UNBALANCED {0}{1} {2}/{3} {4}" -f $pair[0], $pair[1], $a, $b, (Get-Rel $f.FullName)); $bad++ }
    }
  }
  if ($bad -eq 0) { Write-Output '  all files balanced' }
  $script:failed += $bad
}

$reExportNamed = [regex]'export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)'
$reExportType = [regex]'export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)'
$reExportList = [regex]'export\s+(?:type\s+)?\{([^}]*)\}'
$reReexport = [regex]'export\s+(?:\*|\{[^}]*\})\s+from\s*[''"]([^''"]+)[''"]'
$reImport = [regex]'import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*[''"]([^''"]+)[''"]'

function Get-Exports([string]$src) {
  $code = ConvertTo-BlankedCode $src
  $names = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($m in $reExportNamed.Matches($code)) { [void]$names.Add($m.Groups[1].Value) }
  foreach ($m in $reExportType.Matches($code)) { [void]$names.Add($m.Groups[1].Value) }
  foreach ($m in $reExportList.Matches($code)) {
    foreach ($part in $m.Groups[1].Value.Split(',')) {
      $p = $part.Trim() -replace '^type\s+', ''
      if ($p -match '\s+as\s+') { $p = ($p -split '\s+as\s+')[-1].Trim() }
      if ($p -match '^[A-Za-z_$][\w$]*$') { [void]$names.Add($p) }
    }
  }
  if ($code -match 'export\s+default\b') { [void]$names.Add('default') }
  return $names
}

function Resolve-Module([string]$spec, [string]$importer) {
  if ($spec.StartsWith('@/')) { $base = Join-Path $root $spec.Substring(2) }
  elseif ($spec.StartsWith('.')) { $base = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $importer) $spec)) }
  else { return $null }
  foreach ($cand in @("$base.ts", "$base.tsx", (Join-Path $base 'index.ts'), (Join-Path $base 'index.tsx'))) {
    if (Test-Path -LiteralPath $cand -PathType Leaf) { return $cand }
  }
  return $null
}

function Test-Imports {
  Write-Output '=== 2. named imports from local modules resolve ==='
  $files = @(Get-SourceFiles)
  $table = @{}
  foreach ($f in $files) { $table[$f.FullName] = Get-Exports (Get-Text $f.FullName) }

  for ($pass = 0; $pass -lt 3; $pass++) {
    $changed = $false
    foreach ($f in $files) {
      $code = ConvertTo-BlankedCode (Get-Text $f.FullName)
      foreach ($m in $reReexport.Matches($code)) {
        $target = Resolve-Module $m.Groups[1].Value $f.FullName
        if ($target -and $table.ContainsKey($target)) {
          $before = $table[$f.FullName].Count
          foreach ($n in $table[$target]) { if ($n -ne 'default') { [void]$table[$f.FullName].Add($n) } }
          if ($table[$f.FullName].Count -ne $before) { $changed = $true }
        }
      }
    }
    if (-not $changed) { break }
  }

  $problems = 0
  foreach ($f in $files) {
    $code = ConvertTo-BlankedCode (Get-Text $f.FullName)
    foreach ($m in $reImport.Matches($code)) {
      $defaultName = $m.Groups[1].Value
      $named = $m.Groups[2].Value
      $spec = $m.Groups[3].Value
      $target = Resolve-Module $spec $f.FullName
      if (-not $target -or -not $table.ContainsKey($target)) { continue }
      if ($named) {
        foreach ($part in $named.Split(',')) {
          $p = $part.Trim() -replace '^type\s+', ''
          if ($p -match '\s+as\s+') { $p = ($p -split '\s+as\s+')[0].Trim() }
          if ($p -notmatch '^[A-Za-z_$][\w$]*$') { continue }
          if (-not $table[$target].Contains($p)) {
            Write-Output ("  MISSING export '{0}' from {1} (imported by {2})" -f $p, (Get-Rel $target), (Get-Rel $f.FullName))
            $problems++
          }
        }
      }
      if ($defaultName -and -not $table[$target].Contains('default')) {
        Write-Output ("  MISSING default export in {0} (imported by {1})" -f (Get-Rel $target), (Get-Rel $f.FullName))
        $problems++
      }
    }
  }
  if ($problems -eq 0) { Write-Output '  all local imports resolve' }
  $script:failed += $problems
}

function Test-Tables {
  Write-Output '=== 3. tables referenced by lib/db.ts exist in schema.sql ==='
  $schema = Get-Text (Join-Path $root 'supabase\schema.sql')
  $declared = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($m in [regex]::Matches($schema, 'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)', 'IgnoreCase')) {
    [void]$declared.Add($m.Groups[1].Value.ToLower())
  }
  Write-Output ('  schema declares: ' + (($declared | Sort-Object) -join ', '))

  $db = Get-Text (Join-Path $root 'lib\db.ts')
  # Keep template literals (the SQL lives in them) but blank comments and normal
  # strings, so prose like 'Pick a table from the layout.' cannot match.
  $script:keepTemplates = $true
  $db = ConvertTo-BlankedCode $db
  $script:keepTemplates = $false
  $db = [regex]::Replace($db, '(?m)--.*$', ' ')
  $skipWords = @('select', 'where', 'set', 'values', 'into', 'lateral')
  $used = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($m in [regex]::Matches($db, '\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)', 'IgnoreCase')) {
    $name = $m.Groups[1].Value.ToLower()
    if ($skipWords -contains $name) { continue }
    [void]$used.Add($name)
  }
  $missing = @($used | Where-Object { -not $declared.Contains($_) } | Sort-Object)
  if ($missing.Count -gt 0) {
    Write-Output ('  NOT IN SCHEMA: ' + ($missing -join ', '))
    $script:failed += $missing.Count
  } else {
    Write-Output ('  all referenced tables present: ' + (($used | Sort-Object) -join ', '))
  }
}

function Test-ClassNames {
  Write-Output '=== 4. className tokens used in touched components have CSS rules ==='
  $css = Get-Text (Join-Path $root 'app\globals.css')
  $css = [regex]::Replace($css, '/\*.*?\*/', '', 'Singleline')
  $known = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($m in [regex]::Matches($css, '\.([a-zA-Z][\w-]*)')) { [void]$known.Add($m.Groups[1].Value) }

  $targets = @(
    'components/CartView.tsx',
    'components/OrderTracker.tsx',
    'components/AdminOrders.tsx',
    'components/AdminPanel.tsx',
    'components/Profile.tsx',
    'app/orders/[id]/page.tsx'
  )
  $localOk = @('container', 'card', 'btn', 'input', 'muted', 'note', 'subtitle', 'actions', 'tab', 'tabs', 'status', 'active')

  $unknown = @{}
  foreach ($t in $targets) {
    $path = Join-Path $root ($t.Replace('/', '\'))
    if (-not (Test-Path -LiteralPath $path)) { Write-Output ("  MISSING FILE {0}" -f $t); $script:failed++; continue }
    $src = Get-Text $path
    foreach ($m in [regex]::Matches($src, 'className=(?:"([^"]*)"|\{`([^`]*)`\})')) {
      $raw = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value }
      $raw = [regex]::Replace($raw, '\$\{[^}]*\}', ' ')
      foreach ($token in $raw.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)) {
        # A token ending in '-' is the leftover of a `col-${status}` template.
        if ($token.EndsWith('-')) { continue }
        if ($known.Contains($token) -or ($localOk -contains $token)) { continue }
        if (-not $unknown.ContainsKey($token)) { $unknown[$token] = New-Object 'System.Collections.Generic.HashSet[string]' }
        [void]$unknown[$token].Add($t)
      }
    }
  }
  if ($unknown.Count -gt 0) {
    foreach ($token in ($unknown.Keys | Sort-Object)) {
      Write-Output ("  no CSS rule for '{0}' (used in {1})" -f $token, (($unknown[$token] | Sort-Object) -join ', '))
    }
    $script:failed += $unknown.Count
  } else {
    Write-Output '  every className has a matching CSS rule'
  }
}

Write-Output "root: $root`n"
Test-Balance
Write-Output ''
Test-Imports
Write-Output ''
Test-Tables
Write-Output ''
Test-ClassNames
Write-Output ''
if ($script:failed -eq 0) { Write-Output 'RESULT: all checks passed'; exit 0 }
Write-Output ("RESULT: FAILED ({0} problems)" -f $script:failed)
exit 1
