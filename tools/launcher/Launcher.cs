using System;
using System.Diagnostics;
using System.IO;

// 근무관리 실행기: 사이트를 앱 창으로 엽니다. Edge가 없으면 Chrome, 그것도 없으면 기본 브라우저.
class Launcher
{
    const string Url = "https://dsac-attend.web.app/";

    static void Main()
    {
        string[] candidates = {
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "", @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles") ?? "", @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles") ?? "", @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "", @"Google\Chrome\Application\chrome.exe"),
        };
        foreach (var exe in candidates)
        {
            if (File.Exists(exe))
            {
                Process.Start(new ProcessStartInfo(exe, "--app=" + Url) { UseShellExecute = false });
                return;
            }
        }
        Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
    }
}
