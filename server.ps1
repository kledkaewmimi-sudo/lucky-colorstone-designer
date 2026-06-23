$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
$listener.Start()
Write-Host "Server started at http://localhost:8000/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        
        # Sanitize path to prevent directory traversal
        $sanitizedPath = $path.Replace("..", "").TrimStart('/')
        $localFile = [System.IO.Path]::Combine("C:\Users\Acer\.gemini\antigravity-ide\scratch\lucky-colorstone-designer", $sanitizedPath)
        
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
