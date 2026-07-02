$workspaceDir = "C:\Users\Acer\.gemini\antigravity-ide\scratch\lucky-colorstone-designer"
$dataDir = Join-Path $workspaceDir "data"
$stonesFile = Join-Path $dataDir "stones.json"
$charmsFile = Join-Path $dataDir "charms.json"
$ordersFile = Join-Path $dataDir "orders.json"
$settingsFile = Join-Path $dataDir "settings.json"

function Seed-Database {
    param(
        [switch]$Force
    )
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    }

    $shouldSeedStones = $Force -or -not (Test-Path $stonesFile)
    if (-not $shouldSeedStones) {
        $content = (Get-Content $stonesFile -Raw).Trim()
        if ($content -eq "" -or $content -eq "[]" -or $content -eq "{}") {
            $shouldSeedStones = $true
        }
    }
    if ($shouldSeedStones) {
        # Base64 of the default UTF-8 stones.json catalog (to avoid raw non-ASCII character syntax parser bugs on Windows)
        $base64Stones = "77u/WwogIHsKICAgICJpZCI6ICJnb2xkZW5fcnV0aWxlIiwKICAgICJuYW1lIjogIkdvbGRlbiBSdXRpbGUgUXVhcnR6IiwKICAgICJuYW1lVGgiOiAi4LmE4Lir4Lih4LiX4Lit4LiHIiwKICAgICJwNCI6IDEwMCwKICAgICJwNiI6IDE1MCwKICAgICJwOCI6IDEwMCwKICAgICJjYXRlZ29yeSI6ICJ3ZWFsdGgiLAogICAgIm1lYW5pbmciOiAiQXR0cmFjdHMgd2VhbHRoLCBwcm9zcGVyaXR5LCBhbmQgc3VjY2VzcyBpbiBidXNpbmVzcy4iLAogICAgIm1lYW5pbmdUaCI6ICLguJTguLbguIfguJTguLnguJTguITguKfguLLguKHguKHguLHguYjguIfguITguLHguYjguIcg4LmC4LiK4LiE4Lil4Liy4LigIOC5geC4peC4sOC4hOC4p+C4suC4oeC4quC4s+C5gOC4o+C5h+C4iOC5g+C4meC4q+C4meC5ieC4suC4l+C4teC5iOC4geC4suC4o+C4h+C4suC4mSIsCiAgICAiaW1hZ2UiOiAiYXNzZXRzL2dvbGRlbl9ydXRpbGUucG5nIiwKICAgICJjb2xvciI6ICIjRTJDOTc0IiwKICAgICJzaXplcyI6IFs0LCA2LCA4XSwKICAgICJpblN0b2NrIjogdHJ1ZQogIH0sCiAgewogICAgImlkIjogImFtZXRoeXN0IiwKICAgICJuYW1lIjogIkFtZXRoeXN0IiwKICAgICJuYW1lVGgiOiAi4Lit4LmA4Lih4LiX4Li04Liq4LiV4LmMIiwKICAgICJwNCI6IDgwLAogICAgInA2IjogMTIwLAogICAgInA4IjogMTYwLAogICAgImNhdGVnb3J5IjogImNhbG0iLAogICAgIm1lYW5pbmciOiAiQnJpbmdzIHBlYWNlLCBzdHJlc3MgcmVsaWVmLCBhbmQgd2lzZG9tLiIsCiAgICAibWVhbmluZ1RoIjogIuC5gOC4quC4o+C4tOC4oeC4hOC4p+C4suC4oeC4quC4h+C4miDguITguKXguLLguKLguITguKfguLLguKHguYDguITguKPguLXguKLguJQg4LmB4Lil4Liw4LmA4Liq4Lij4Li04Lih4Liq4Lij4LmJ4Liy4LiH4Liq4LiV4Li04Lib4Lix4LiN4LiN4LiyIiwKICAgICJpbWFnZSI6ICJhc3NldHMvYW1ldGh5c3QucG5nIiwKICAgICJjb2xvciI6ICIjOUY4NkMwIiwKICAgICJzaXplcyI6IFs0LCA2LCA4XSwKICAgICJpblN0b2NrIjogdHJ1ZQogIH0sCiAgewogICAgImlkIjogInJvc2VfcXVhcnR6IiwKICAgICJuYW1lIjogIlJvc2UgUXVhcnR6IiwKICAgICJuYW1lVGgiOiAi4LmC4Lij4Liq4LiE4Lin4Lit4LiV4LiL4LmMIiwKICAgICJwNCI6IDYwLAogICAgInA2IjogOTAsCiAgICAicDgiOiAxMjAsCiAgICAiY2F0ZWdvcnkiOiAibG92ZSIsCiAgICAibWVhbmluZyI6ICJBdHRyYWN0cyBsb3ZlLCBjb21wYXNzaW9uLCBhbmQgZW1vdGlvbmFsIGhlYWxpbmcuIiwKICAgICJtZWFuaW5nVGgiOiAi4LiU4Li24LiH4LiU4Li54LiU4LiE4Lin4Liy4Lih4Lij4Lix4LiBIOC4hOC4p+C4suC4oeC5gOC4oeC4leC4leC4siDguYHguKXguLDguIHguLLguKPguYDguKLguLXguKLguKfguKLguLLguK3guLLguKPguKHguJPguYzguITguKfguLLguKHguKPguLnguYnguKrguLbguIEiLAogICAgImltYWdlIjogImFzc2V0cy9yb3NlX3F1YXJ0ei5wbmciLAogICAgImNvbG9yIjogIiNGRkNBRDQiLAogICAgInNpemVzIjogWzQsIDYsIDhdLAogICAgImluU3RvY2siOiB0cnVlCiAgfSwKICB7CiAgICAiaWQiOiAibGFwaXNfbGF6dWxpIiwKICAgICJuYW1lIjogIkxhcGlzIExhenVsaSIsCiAgICAibmFtZVRoIjogIuC4peC4suC4nuC4tOC4qiDguKXguLLguIvguLnguKXguLUiLAogICAgInA0IjogNzAsCiAgICAicDYiOiAxMTAsCiAgICAicDgiOiAxNTAsCiAgICAiY2F0ZWdvcnkiOiAiY2FsbSIsCiAgICAibWVhbmluZyI6ICJFbmhhbmNlcyB0cnV0aCwgd2lzZG9tLCBhbmQgaW50ZWxsZWN0dWFsIGFiaWxpdHkuIiwKICAgICJtZWFuaW5nVGgiOiAi4LmA4Liq4Lij4Li04Lih4LiE4Lin4Liy4Lih4LiI4Lij4Li04LiH4LmD4LiIIOC4quC4leC4tOC4m+C4seC4jeC4jeC4siDguYHguKXguLDguITguKfguLLguKHguKrguLLguKHguLLguKPguJbguJfguLLguIfguKrguJXguLTguJvguLHguI3guI3guLIiLAogICAgImltYWdlIjogImFzc2V0cy9sYXBpc19sYXp1bGkucG5nIiwKICAgICJjb2xvciI6ICIjMkE0QjdDIiwKICAgICJzaXplcyI6IFs0LCA2LCA4XSwKICAgICJpblN0b2NrIjogdHJ1ZQogIH0sCiAgewogICAgImlkIjogInRpZ2Vyc19leWUiLAogICAgIm5hbWUiOiAiVGlnZXIncyBFeWUiLAogICAgIm5hbWVUaCI6ICLguYTguJfguYDguIHguK3guKPguYzguK3guLLguKIiLAogICAgInA0IjogOTAsCiAgICAicDYiOiAxMzAsLAogICAgInA4IjogMTcwLAogICAgImNhdGVnb3J5IjogInByb3RlY3Rpb24iLAogICAgIm1lYW5pbmciOiAiQnJpbmdzIGNvdXJhZ2UsIHByb3RlY3Rpb24sIGFuZCBtZW50YWwgY2xhcml0eS4iLAogICAgIm1lYW5pbmdUaCI6ICLguYDguJvguLTguYjguKHguITguKfguLLguKHguIHguKXguYnguLLguKvguLLguI0g4LiB4Liy4Lij4Lib4LiB4Lib4LmJ4Lit4LiH4LiE4Li44LmJ4Lih4LiE4Lij4Lit4LiHIOC5geC4peC4sOC4hOC4p+C4suC4oeC4iuC4seC4lOC5gOC4iOC4me5gOC4meC4iOC4tOC4leC5g+C4iCIsCiAgICAiaW1hZ2UiOiAiYXNzZXRzL3RpZ2Vyc19leWUucG5nIiwKICAgICJjb2xvciI6ICIjQjcwQzNEIiwKICAgICJzaXplcyI6IFs0LCA2LCA4XSwKICAgICJpblN0b2NrIjogdHJ1ZQogIH0sCiAgewogICAgImlkIjogImJsYWNrX29ic2lkaWFuIiwKICAgICJuYW1lIjogIkJsYWNrIE9ic2lkaWFuIiwKICAgICJuYW1lVGgiOiAi4Lit4Lit4Lia4LiL4Li04LmA4LiU4Li14Li44LiZIiwKICAgICJwNCI6IDcwLAogICAgInA2IjogMTAwLAogICAgInA4IjogMTMwLAogICAgImNhdGVnb3J5IjogInByb3RlY3Rpb24iLAogICAgIm1lYW5pbmciOiAiUG93ZXJmdWwgcHJvdGVjdGl2ZSBzdG9uZSBhZ2FpbnN0IG5lZ2F0aXZpdHkgYW5kIHN0cmVzcy4iLAogICAgIm1lYW5pbmdUaCI6ICLguKvguLTguJnguYHguKvguYjguIfguIHguLLguKPguJvguIHguJvguYnguK3guIfguITguLjguYnguKHguITguKPguK3guIfguJfguLXguYjguYHguILguYfguIfguYHguIHguKPguYjguIcg4Lib4LmJ4Lit4LiH4LiB4Lix4LiZ4Lie4Lil4Lix4LiH4LiH4Liy4LiZ4Lil4LiaIiwKICAgICJpbWFnZSI6ICJhc3NldHMvYmxhY2tfb2JzaWRpYW4ucG5nIiwKICAgICJjb2xvciI6ICIjMUUxRTFFIiwKICAgICJzaXplcyI6IFs0LCA2LCA4XSwKICAgICJpblN0b2NrIjogdHJ1ZQogIH0sCiAgewogICAgImlkIjogImdyZWVuX2F2ZW50dXJpbmUiLAogICAgIm5hbWUiOiAiR3JlZW4gQXZlbnR1cmluZSIsCiAgICAibmFtZVRoIjogIi4LiB4Lij4Li14LiZIOC4reC5gOC4p+C4meC5gOC4iOC4reC4o+C4teC4mSIsCiAgICAicDQiOiA3NSwKICAgICJwNiI6IDExMCwKICAgICJwOCI6IDE0NSwKICAgICJjYXRlZ29yeSI6ICJ3ZWFsdGgiLAogICAgIm1lYW5pbmciOiAiU3RvbmUgb2Ygb3Bwb3J0dW5pdHksIGx1Y2ssIGFuZCBhbGlnbm1lbnQgb2Ygd2VhbHRoLiIsCiAgICAibWVhbmluZ1RoIjogIuC4q+C4tOC4meC5geC4q+C5iOC4eC5guC4reC4geC4suC4qiDguYLguIrguITguKXguLLguKAg4LmB4Lil4Liw4LiE4Lin4Liy4Lih4LmA4LiI4Lij4Li04LiN4Lij4Li44LmI4LiH4LmA4Lij4Li34Lit4LiHIiwKICAgICJpbWFnZSI6ICJhc3NldHMvZ3JlZW5fYXZlbnR1cmluZS5wbmciLAogICAgImNvbG9yIjogIiM2RTlBODIiLAogICAgInNpemVzIjogWzQsIDYsIDhdLAogICAgImluU3RvY2siOiB0cnVlCiAgfSwKICB7CiAgICAiaWQiOiAicmVkX2phc3BlciIsCiAgICAibmFtZSI6ICJSZWQgSmFzcGVyIiwKICAgICJuYW1lVGgiOiAi4LmA4Lij4LiU4LmB4LiI4Liq4LmA4Lib4Lit4Lij4LmMIiwKICAgICJwNCI6IDcwLAogICAgInA2IjogMTAwLAogICAgInA4IjogMTMwLAogICAgImNhdGVnb3J5IjogInByb3RlY3Rpb24iLAogICAgIm1lYW5pbmciOiAiQnJpbmdzIHN0cmVuZ3RoLCBjb3VyYWdlLCBhbmQgZ3JvdW5kaW5nIGVuZXJneS4iLAogICAgIm1lYW5pbmdUaCI6ICLguYDguKrguKPguLTguKHguJ7guKXguLDguIHguLPguKXguLHguIcg4LiE4Lin4Liy4Lih4LiB4Lil4LmJ4Liy4Lir4Liy4LiNIOC5geC4peC4sOC4hOC4p+C4suC4oeC4oeC4seC5iOC4meC4hOC4h+C5g+C4meC4iOC4tOC4leC5g+C4iCIsCiAgICAiaW1hZ2UiOiAiYXNzZXRzL3JlZF9qYXNwZXIucG5nIiwKICAgICJjb2xvciI6ICIjQjgzQTNBIiwKICAgICJzaXplcyI6IFs0LCA2LCA4XSwKICAgICJpblN0b2NrIjogdHJ1ZQogIH0sCiAgewogICAgImlkIjogIm1hbGFjaGl0ZSIsCiAgICAibmFtZSI6ICJNYWxhY2hpdGUiLAogICAgIm5hbWVUaCI6ICLguKHguLLguKXguLLguYTguITguJfguYwiLAogICAgInA0IjogMTIwLAogICAgInA2IjogMTgwLAogICAgInA4IjogMjQwLAogICAgImNhdGVnb3J5IjogInByb3RlY3Rpb24iLAogICAgIm1lYW5pbmciOiAiUG93ZXJmdWwgcHJvdGVjdG9yIGFuZCBzdG9uZSBvZiB0cmFuc2Zvcm1hdGlvbi4iLAogICAgIm1lYW5pbmdUaCI6ICLguKvguLTguJnguYHguKvguYjguIfguIHguLLguKPguJvguIHguJvguYnguK3guIfguITguLjguYnguKHguITguKPguK3guIfguYHguKXguLDguILguIjguLHguJTguKDguLHguKLguJ7guLTguJrguLHguJXguLQiLAogICAgImltYWdlIjogImFzc2V0cy9tYWxhY2hpdGUucG5nIiwKICAgICJjb2xvciI6ICIjMUU1NjMxIiwKICAgICJzaXplcyI6IFs0LCA2LCA4XSwKICAgICJpblN0b2NrIjogdHJ1ZQogIH0sCiAgewogICAgImlkIjogImNpdHJpbmUiLAogICAgIm5hbWUiOiAiQ2l0cmluZSIsCiAgICAibmFtZVRoIjogIuC4i+C4tOC4l+C4o+C4tOC4mSIsCiAgICAicDQiOi /MCwKICAgICicDkiOiAxNDAsCiAgICAicDgiOiAxOTAsCiAgICAiY2F0ZWdvcnkiOiAid2VhbHRoIiwKICAgICJtZWFuaW5nIjogIkF0dHJhY3RzIGFidW5kYW5jZSwgcHJvc3Blcml0eSwgYW5kIHN1Y2Nlc3MuIiwKICAgICJtZWFuaW5nVGgiOiAi4LiU4Li24LiH4LiU4Li54LiU4LmC4LiK4LiE4Lil4Liy4Lig4LmA4LiH4Li04LiZ4LiX4Lit4LiH4LmB4Lil4Liw4LiE4Lin4Liy4Lih4Liq4Liz4LmA4Lij4LmH4LiIIiwKICAgICJpbWFnZSI6ICJhc3NldHMvY2l0cmluZS5wbmciLAogICAgImNvbG9yIjogIiNFNUE5M0MiLAogICAgInNpemVzIjogWzQsIDYsIDhdLAogICAgImluU3RvY2siOiB0cnVlCiAgfQpd"
        $bytes = [System.Convert]::FromBase64String($base64Stones)
        [System.IO.File]::WriteAllBytes($stonesFile, $bytes)
    }

    $shouldSeedCharms = $Force -or -not (Test-Path $charmsFile)
    if (-not $shouldSeedCharms) {
        $content = (Get-Content $charmsFile -Raw).Trim()
        if ($content -eq "" -or $content -eq "[]" -or $content -eq "{}") {
            $shouldSeedCharms = $true
        }
    }
    if ($shouldSeedCharms) {
        if (Test-Path $charmsFile) {
            # Keep the repository seed if it already exists but is empty/invalid.
            $rawSeed = (Get-Content $charmsFile -Raw)
            if ($rawSeed.Trim()) {
                [System.IO.File]::WriteAllText($charmsFile, $rawSeed, [System.Text.Encoding]::UTF8)
            } else {
                [System.IO.File]::WriteAllText($charmsFile, "[]", [System.Text.Encoding]::UTF8)
            }
        } else {
            [System.IO.File]::WriteAllText($charmsFile, "[]", [System.Text.Encoding]::UTF8)
        }
    }

    $shouldSeedOrders = $Force -or -not (Test-Path $ordersFile)
    if (-not $shouldSeedOrders) {
        $content = (Get-Content $ordersFile -Raw).Trim()
        if ($content -eq "") {
            $shouldSeedOrders = $true
        }
    }
    if ($shouldSeedOrders) {
        [System.IO.File]::WriteAllText($ordersFile, "[]", [System.Text.Encoding]::UTF8)
    }

    $shouldSeedSettings = $Force -or -not (Test-Path $settingsFile)
    if (-not $shouldSeedSettings) {
        $content = (Get-Content $settingsFile -Raw).Trim()
        if ($content -eq "") {
            $shouldSeedSettings = $true
        }
    }
    if ($shouldSeedSettings) {
        $defaultSettings = @{
            globalDiscountPercent = 20
        }
        $defaultSettingsJson = ConvertTo-Json -InputObject $defaultSettings -Compress
        [System.IO.File]::WriteAllText($settingsFile, $defaultSettingsJson, [System.Text.Encoding]::UTF8)
    }
}

function Convert-To-Json-Array ($array) {
    if ($null -eq $array) {
        return "[]"
    }
    $arr = @($array)
    if ($arr.Count -eq 0) {
        return "[]"
    }
    $json = $arr | ConvertTo-Json -Depth 10 -Compress
    if ($arr.Count -eq 1) {
        return "[$json]"
    }
    return $json
}

Seed-Database

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
$listener.Start()
Write-Host "Server started at http://localhost:8000/"

function Send-JsonResponse($response, $data, $statusCode = 200) {
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    
    $json = ConvertTo-Json -InputObject $data -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

function Send-JsonStringResponse($response, $jsonString, $statusCode = 200) {
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # CORS Preflight
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
            $response.StatusCode = 200
            $response.OutputStream.Close()
            continue
        }

        $path = $request.Url.LocalPath

        # API Router
        if ($path.StartsWith("/api/")) {
            try {
                # Load existing data
                $stones = [System.IO.File]::ReadAllText($stonesFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                $charms = [System.IO.File]::ReadAllText($charmsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                $orders = [System.IO.File]::ReadAllText($ordersFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                $settings = [System.IO.File]::ReadAllText($settingsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

                # Read body if request has entity body
                $bodyObj = $null
                if ($request.HasEntityBody) {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()
                    if ($body) {
                        $bodyObj = ConvertFrom-Json $body
                    }
                }

                # Endpoint: GET /api/stones
                if ($path -eq "/api/stones" -and $request.HttpMethod -eq "GET") {
                    $rawJson = [System.IO.File]::ReadAllText($stonesFile, [System.Text.Encoding]::UTF8)
                    Send-JsonStringResponse $response $rawJson
                    continue
                }

                # Endpoint: POST /api/stones/save
                if ($path -eq "/api/stones/save" -and $request.HttpMethod -eq "POST") {
                    if ($null -ne $bodyObj) {
                        $existingIndex = -1
                        for ($i = 0; $i -lt $stones.Count; $i++) {
                            if ($stones[$i].id -eq $bodyObj.id) {
                                $existingIndex = $i
                                break
                            }
                        }

                        if ($existingIndex -ne -1) {
                            $stones[$existingIndex] = $bodyObj
                        } else {
                            $stones += $bodyObj
                        }

                        $stonesJson = Convert-To-Json-Array $stones
                        [System.IO.File]::WriteAllText($stonesFile, $stonesJson, [System.Text.Encoding]::UTF8)
                        Send-JsonResponse $response $bodyObj
                    } else {
                        Send-JsonResponse $response @{ error = "Empty body" } 400
                    }
                    continue
                }

                # Endpoint: POST /api/stones/delete
                if ($path -eq "/api/stones/delete" -and $request.HttpMethod -eq "POST") {
                    if ($null -ne $bodyObj -and $null -ne $bodyObj.id) {
                        $newStones = @()
                        foreach ($s in $stones) {
                            if ($s.id -ne $bodyObj.id) {
                                $newStones += $s
                            }
                        }
                        $stonesJson = Convert-To-Json-Array $newStones
                        [System.IO.File]::WriteAllText($stonesFile, $stonesJson, [System.Text.Encoding]::UTF8)
                        Send-JsonResponse $response @{ success = $true; id = $bodyObj.id }
                    } else {
                        Send-JsonResponse $response @{ error = "Missing ID" } 400
                    }
                    continue
                }

                # Endpoint: GET /api/charms
                if ($path -eq "/api/charms" -and $request.HttpMethod -eq "GET") {
                    $rawJson = [System.IO.File]::ReadAllText($charmsFile, [System.Text.Encoding]::UTF8)
                    Send-JsonStringResponse $response $rawJson
                    continue
                }

                # Endpoint: POST /api/charms
                if ($path -eq "/api/charms" -and $request.HttpMethod -eq "POST") {
                    if ($null -ne $bodyObj -and $null -ne $bodyObj.id) {
                        $existingIndex = -1
                        for ($i = 0; $i -lt $charms.Count; $i++) {
                            if ($charms[$i].id -eq $bodyObj.id) {
                                $existingIndex = $i
                                break
                            }
                        }

                        if ($existingIndex -ne -1) {
                            Send-JsonResponse $response @{ error = "Charm already exists" } 409
                        } else {
                            $charms += $bodyObj
                            $charmsJson = Convert-To-Json-Array $charms
                            [System.IO.File]::WriteAllText($charmsFile, $charmsJson, [System.Text.Encoding]::UTF8)
                            Send-JsonResponse $response $bodyObj 201
                        }
                    } else {
                        Send-JsonResponse $response @{ error = "Missing charm ID" } 400
                    }
                    continue
                }

                if ($path.StartsWith("/api/charms/")) {
                    $charmId = [System.Uri]::UnescapeDataString($path.Substring("/api/charms/".Length))
                    if ([string]::IsNullOrWhiteSpace($charmId)) {
                        Send-JsonResponse $response @{ error = "Missing charm ID" } 400
                        continue
                    }

                    if ($request.HttpMethod -eq "PUT") {
                        if ($null -eq $bodyObj -or $null -eq $bodyObj.id) {
                            Send-JsonResponse $response @{ error = "Missing charm payload" } 400
                            continue
                        }

                        $existingIndex = -1
                        for ($i = 0; $i -lt $charms.Count; $i++) {
                            if ($charms[$i].id -eq $charmId) {
                                $existingIndex = $i
                                break
                            }
                        }

                        if ($existingIndex -eq -1) {
                            Send-JsonResponse $response @{ error = "Charm not found" } 404
                        } else {
                            $bodyObj.id = $charmId
                            $charms[$existingIndex] = $bodyObj
                            $charmsJson = Convert-To-Json-Array $charms
                            [System.IO.File]::WriteAllText($charmsFile, $charmsJson, [System.Text.Encoding]::UTF8)
                            Send-JsonResponse $response $bodyObj
                        }
                        continue
                    }

                    if ($request.HttpMethod -eq "DELETE") {
                        $newCharms = @()
                        $deleted = $false
                        foreach ($c in $charms) {
                            if ($c.id -eq $charmId) {
                                $deleted = $true
                            } else {
                                $newCharms += $c
                            }
                        }

                        if (-not $deleted) {
                            Send-JsonResponse $response @{ error = "Charm not found" } 404
                        } else {
                            $charmsJson = Convert-To-Json-Array $newCharms
                            [System.IO.File]::WriteAllText($charmsFile, $charmsJson, [System.Text.Encoding]::UTF8)
                            Send-JsonResponse $response @{ success = $true; id = $charmId }
                        }
                        continue
                    }
                }

                # Endpoint: GET /api/orders
                if ($path -eq "/api/orders" -and $request.HttpMethod -eq "GET") {
                    $rawJson = [System.IO.File]::ReadAllText($ordersFile, [System.Text.Encoding]::UTF8)
                    Send-JsonStringResponse $response $rawJson
                    continue
                }

                # Endpoint: POST /api/orders
                if ($path -eq "/api/orders" -and $request.HttpMethod -eq "POST") {
                    if ($null -ne $bodyObj) {
                        # Auto-fill ID and Date if missing
                        if (-not $bodyObj.id) {
                            $bodyObj | Add-Member -MemberType NoteProperty -Name "id" -Value ("ORD-" + (Get-Random -Minimum 100000 -Maximum 999999)) -Force
                        }
                        if (-not $bodyObj.date) {
                            $bodyObj | Add-Member -MemberType NoteProperty -Name "date" -Value (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ") -Force
                        }
                        if (-not $bodyObj.status) {
                            $bodyObj | Add-Member -MemberType NoteProperty -Name "status" -Value "New Order" -Force
                        }

                        # Prepend to orders
                        $newOrders = @($bodyObj) + $orders
                        $ordersJson = Convert-To-Json-Array $newOrders
                        [System.IO.File]::WriteAllText($ordersFile, $ordersJson, [System.Text.Encoding]::UTF8)
                        Send-JsonResponse $response $bodyObj
                    } else {
                        Send-JsonResponse $response @{ error = "Empty body" } 400
                    }
                    continue
                }

                # Endpoint: POST /api/orders/update-status
                if ($path -eq "/api/orders/update-status" -and $request.HttpMethod -eq "POST") {
                    if ($null -ne $bodyObj -and $null -ne $bodyObj.id -and $null -ne $bodyObj.status) {
                        for ($i = 0; $i -lt $orders.Count; $i++) {
                            if ($orders[$i].id -eq $bodyObj.id) {
                                $orders[$i].status = $bodyObj.status
                                break
                            }
                        }
                        $ordersJson = Convert-To-Json-Array $orders
                        [System.IO.File]::WriteAllText($ordersFile, $ordersJson, [System.Text.Encoding]::UTF8)
                        Send-JsonResponse $response @{ success = $true; id = $bodyObj.id; status = $bodyObj.status }
                    } else {
                        Send-JsonResponse $response @{ error = "Missing parameters" } 400
                    }
                    continue
                }

                # Endpoint: GET /api/settings
                if ($path -eq "/api/settings" -and $request.HttpMethod -eq "GET") {
                    $rawJson = [System.IO.File]::ReadAllText($settingsFile, [System.Text.Encoding]::UTF8)
                    Send-JsonStringResponse $response $rawJson
                    continue
                }

                # Endpoint: POST /api/settings/save
                if ($path -eq "/api/settings/save" -and $request.HttpMethod -eq "POST") {
                    if ($null -ne $bodyObj) {
                        $settingsJson = ConvertTo-Json -InputObject $bodyObj -Compress
                        [System.IO.File]::WriteAllText($settingsFile, $settingsJson, [System.Text.Encoding]::UTF8)
                        Send-JsonResponse $response $bodyObj
                    } else {
                        Send-JsonResponse $response @{ error = "Empty body" } 400
                    }
                    continue
                }

                # Endpoint: POST /api/reset
                if ($path -eq "/api/reset" -and $request.HttpMethod -eq "POST") {
                    Seed-Database -Force
                    Send-JsonResponse $response @{ success = $true }
                    continue
                }

                # Route not matched
                Send-JsonResponse $response @{ error = "API Route Not Found" } 404
            } catch {
                Send-JsonResponse $response @{ error = $_.Exception.Message } 500
            }
            continue
        }

        # Static File Server Routing
        # Sanitize path to prevent directory traversal
        $sanitizedPath = $path.Replace("..", "").TrimStart('/')
        if ($sanitizedPath -eq "") { $sanitizedPath = "index.html" }
        $localFile = [System.IO.Path]::Combine($workspaceDir, $sanitizedPath)
        
        if (Test-Path $localFile -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($localFile)
            
            # Set content-type
            $ext = [System.IO.Path]::GetExtension($localFile).ToLower()
            switch ($ext) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".css"  { $response.ContentType = "text/css" }
                ".js"   { $response.ContentType = "application/javascript" }
                ".png"  { $response.ContentType = "image/png" }
                ".jpg"  { $response.ContentType = "image/jpeg" }
                ".svg"  { $response.ContentType = "image/svg+xml" }
                default { $response.ContentType = "application/octet-stream" }
            }
            
            # Add CORS header to allow local assets to be loaded by canvas safely
            $response.Headers.Add("Access-Control-Allow-Origin", "*")

            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $errorMsg = [System.Text.Encoding]::UTF8.GetBytes("File Not Found: $path")
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $errorMsg.Length
            $response.OutputStream.Write($errorMsg, 0, $errorMsg.Length)
        }
        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
}
