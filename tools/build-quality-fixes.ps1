param([string]$LogName='quality-fixes-build',[switch]$ActorReview)
$ErrorActionPreference='Stop'
$projectDirectory=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$previewPort=if($ActorReview){7461}else{7457}
$previewScript=if($ActorReview){'tools/actor-preview.cjs'}else{'tools/preview.cjs'}
$buildTask=if($ActorReview){'build:actors'}else{'build:web'}
$expectedScript=[regex]::Escape($previewScript).Replace('/', '[\\/]')
$listener=Get-NetTCPConnection -LocalPort $previewPort -State Listen -ErrorAction SilentlyContinue
if($listener){
    $previewProcessId=$listener.OwningProcess
    $previewProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$previewProcessId"
    if($previewProcess.CommandLine -notmatch $expectedScript) { throw "Port $previewPort is not owned by the expected project preview; refusing to stop it." }
    Stop-Process -Id $previewProcessId
}
$resultCode=1
try {
    Push-Location -LiteralPath $projectDirectory
    try {
        # Windows PowerShell 5 surfaces native stderr as ErrorRecords even for SDK diagnostics.
        $savedErrorPreference=$ErrorActionPreference
        try {
            $ErrorActionPreference='Continue'
            npm run $buildTask *> "temp/$LogName.log"
            $resultCode=$LASTEXITCODE
        } finally { $ErrorActionPreference=$savedErrorPreference }
        Get-Content -LiteralPath "temp/$LogName.log" -Tail 10
    } finally { Pop-Location }
} finally {
    $nodeExecutable=(Get-Command node).Source
    $previewProcess=Start-Process -FilePath $nodeExecutable -ArgumentList $previewScript -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput "$projectDirectory/temp/$LogName-preview.log" -RedirectStandardError "$projectDirectory/temp/$LogName-preview-error.log" -PassThru
    Write-Output "Project preview restored: $($previewProcess.Id)"
}
exit $resultCode
