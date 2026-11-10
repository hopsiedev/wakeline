<#
.SYNOPSIS
  Measure Wakeline CPU and private memory while idle (targets: CPU below 1% and
  private memory below 100 MB, Q59).

.DESCRIPTION
  Measures an existing process without launching the app. Open Wakeline (the app
  or `wakeline watch`), wait for the initial scan, leave watched projects idle,
  and run this script. It samples once per second.

  CPU is normalized across all logical processors. Memory uses PrivateMemorySize64
  for one process; it excludes child processes such as WebView2. This does not
  measure the full application's memory budget.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/measure-idle.ps1
  powershell -ExecutionPolicy Bypass -File scripts/measure-idle.ps1 -ProcessName wakeline -Seconds 60
#>
param(
    [Alias('Proceso')]
    [string]$ProcessName = 'wakeline-app',
    [Alias('Segundos')]
    [int]$Seconds = 300
)

$processes = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($processes.Count -eq 0) {
    Write-Error "No process named '$ProcessName' is running. Open Wakeline first."
    exit 1
}
$p = $processes[0]
$cpus = [Environment]::ProcessorCount
Write-Host "Measuring $ProcessName (PID $($p.Id)) for $Seconds s across $cpus CPUs..."

$initialCpu = $p.TotalProcessorTime.TotalSeconds
$started = Get-Date
$peakMemory = 0
$totalMemory = 0
$samples = 0
for ($i = 0; $i -lt $Seconds; $i++) {
    Start-Sleep -Seconds 1
    $p.Refresh()
    if ($p.HasExited) {
        Write-Error 'The process exited during measurement.'
        exit 1
    }
    $ram = $p.PrivateMemorySize64 / 1MB
    $totalMemory += $ram
    $samples++
    if ($ram -gt $peakMemory) { $peakMemory = $ram }
}
$elapsed = ((Get-Date) - $started).TotalSeconds
$usedCpu = $p.TotalProcessorTime.TotalSeconds - $initialCpu
$cpuPercent = 100 * $usedCpu / ($elapsed * $cpus)

$result = [pscustomobject]@{
    Process       = $ProcessName
    Seconds       = [math]::Round($elapsed)
    'Average CPU %' = [math]::Round($cpuPercent, 3)
    'Average private memory MB' = [math]::Round($totalMemory / $samples, 1)
    'Peak private memory MB'  = [math]::Round($peakMemory, 1)
    'CPU < 1 %'   = $cpuPercent -lt 1
    'Private memory < 100 MB' = $peakMemory -lt 100
}
$result | Format-List
