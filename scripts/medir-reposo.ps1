<#
.SYNOPSIS
  Mide la CPU y la RAM de Wakeline en reposo (objetivo: menos de 1 % de CPU y menos de
  100 MB de RAM, Q59).

.DESCRIPTION
  No lanza nada: mide un proceso que ya está corriendo. Abre Wakeline (la app o
  `wakeline watch`), espera a que termine el primer escaneo, no toques los proyectos
  vigilados y ejecuta este script. Toma una muestra por segundo.

  La CPU es el porcentaje del equipo entero (todas las CPU), igual que el Administrador
  de tareas. La RAM es el conjunto de trabajo privado más alto visto.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/medir-reposo.ps1
  powershell -ExecutionPolicy Bypass -File scripts/medir-reposo.ps1 -Proceso wakeline -Segundos 60
#>
param(
    [string]$Proceso = 'wakeline-app',
    [int]$Segundos = 300
)

$procesos = @(Get-Process -Name $Proceso -ErrorAction SilentlyContinue)
if ($procesos.Count -eq 0) {
    Write-Error "No hay ningún proceso '$Proceso' corriendo. Abre Wakeline primero."
    exit 1
}
$p = $procesos[0]
$cpus = [Environment]::ProcessorCount
Write-Host "Midiendo $Proceso (PID $($p.Id)) durante $Segundos s con $cpus CPU..."

$cpuInicial = $p.TotalProcessorTime.TotalSeconds
$inicio = Get-Date
$ramMax = 0
$ramSuma = 0
$muestras = 0
for ($i = 0; $i -lt $Segundos; $i++) {
    Start-Sleep -Seconds 1
    $p.Refresh()
    if ($p.HasExited) {
        Write-Error 'El proceso terminó durante la medición.'
        exit 1
    }
    $ram = $p.PrivateMemorySize64 / 1MB
    $ramSuma += $ram
    $muestras++
    if ($ram -gt $ramMax) { $ramMax = $ram }
}
$transcurrido = ((Get-Date) - $inicio).TotalSeconds
$cpuUsada = $p.TotalProcessorTime.TotalSeconds - $cpuInicial
$cpuPorcentaje = 100 * $cpuUsada / ($transcurrido * $cpus)

$resultado = [pscustomobject]@{
    Proceso       = $Proceso
    Segundos      = [math]::Round($transcurrido)
    'CPU media %' = [math]::Round($cpuPorcentaje, 3)
    'RAM media MB' = [math]::Round($ramSuma / $muestras, 1)
    'RAM max MB'  = [math]::Round($ramMax, 1)
    'CPU < 1 %'   = $cpuPorcentaje -lt 1
    'RAM < 100 MB' = $ramMax -lt 100
}
$resultado | Format-List
