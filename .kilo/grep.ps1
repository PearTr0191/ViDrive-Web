param([string]$Path, [string[]]$Patterns)
$Patterns | ForEach-Object {
  $r = Select-String -Path $Path -Pattern $_ -AllMatches
  $r | ForEach-Object { '{0}: {1}' -f $_.LineNumber, $_.Line.Trim() }
}
