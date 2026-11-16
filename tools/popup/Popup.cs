using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Net;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// 근무관리 팝업: 화면 오른쪽 아래에 '+' 패널의 하반기 시간외 잔여와 바로가기를 띄웁니다.
// 로그인 정보(공유 비밀번호, 사번)는 저장하지 않고, 실행할 때마다 한 번 입력받습니다.
class Popup : Form
{
    const string ApiUrl = "https://script.google.com/macros/s/AKfycbwdy3mwoUb9NewF8RAnBp4267kbBLwVxhvj2PbPIgIgT3x_JxfWv4S1YLHDLBn0BRl50w/exec";
    const string SiteUrl = "https://dsac-attend.web.app/";

    string pw, uid;
    Label title, big, sub, months;
    ProgressBar bar;

    static string SavePath = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DSAC-Attend", "login.bin");

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        string pw, uid;
        if (!LoadSaved(out pw, out uid) && !AskLogin(out pw, out uid)) return;
        Application.Run(new Popup(pw, uid));
    }

    // 저장: 이 Windows 사용자 계정에서만 풀리도록 암호화(DPAPI)해서 보관합니다.
    static void SaveLogin(string pw, string uid)
    {
        try
        {
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(SavePath));
            byte[] plain = System.Text.Encoding.UTF8.GetBytes(pw + "\n" + uid);
            byte[] enc = System.Security.Cryptography.ProtectedData.Protect(plain, null, System.Security.Cryptography.DataProtectionScope.CurrentUser);
            System.IO.File.WriteAllBytes(SavePath, enc);
        }
        catch { }
    }

    static bool LoadSaved(out string pw, out string uid)
    {
        pw = ""; uid = "";
        try
        {
            if (!System.IO.File.Exists(SavePath)) return false;
            byte[] enc = System.IO.File.ReadAllBytes(SavePath);
            string s = System.Text.Encoding.UTF8.GetString(System.Security.Cryptography.ProtectedData.Unprotect(enc, null, System.Security.Cryptography.DataProtectionScope.CurrentUser));
            var parts = s.Split('\n');
            if (parts.Length < 2) return false;
            pw = parts[0]; uid = parts[1];
            return pw.Length > 0 && uid.Length > 0;
        }
        catch { return false; }
    }

    static bool AskLogin(out string pw, out string uid)
    {
        pw = ""; uid = "";
        using (var f = new Form { Text = "근무관리", Width = 300, Height = 180, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterScreen, MaximizeBox = false, MinimizeBox = false })
        {
            var l1 = new Label { Text = "공유 비밀번호", Left = 16, Top = 16, Width = 110 };
            var t1 = new TextBox { Left = 130, Top = 12, Width = 140, UseSystemPasswordChar = true };
            var l2 = new Label { Text = "사번", Left = 16, Top = 50, Width = 110 };
            var t2 = new TextBox { Left = 130, Top = 46, Width = 140 };
            var ok = new Button { Text = "열기", Left = 130, Top = 90, Width = 140, Height = 30, DialogResult = DialogResult.OK };
            f.Controls.AddRange(new Control[] { l1, t1, l2, t2, ok });
            f.AcceptButton = ok;
            if (f.ShowDialog() != DialogResult.OK) return false;
            pw = t1.Text.Trim(); uid = t2.Text.Trim();
            return pw.Length > 0 && uid.Length > 0;
        }
    }

    public Popup(string pw, string uid)
    {
        this.pw = pw; this.uid = uid;
        FormBorderStyle = FormBorderStyle.FixedToolWindow;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        Width = 300; Height = 300;
        BackColor = Color.White;
        var wa = Screen.PrimaryScreen.WorkingArea;
        Location = new Point(wa.Right - Width - 12, wa.Bottom - Height - 12);

        title = new Label { Text = "하반기 시간외 잔여", Left = 16, Top = 14, Width = 260, Font = new Font("Malgun Gothic", 10, FontStyle.Bold) };
        big = new Label { Text = "-", Left = 16, Top = 40, Width = 260, Height = 50, Font = new Font("Malgun Gothic", 26, FontStyle.Bold) };
        bar = new ProgressBar { Left = 16, Top = 96, Width = 260, Height = 10, Maximum = 100 };
        sub = new Label { Text = "", Left = 16, Top = 110, Width = 260, Font = new Font("Malgun Gothic", 9) };
        months = new Label { Text = "", Left = 16, Top = 134, Width = 260, Height = 60, Font = new Font("Malgun Gothic", 9) };
        var b1 = new Button { Text = "탄력근무표", Left = 16, Top = 210, Width = 120, Height = 30 };
        var b2 = new Button { Text = "시간외 신청", Left = 156, Top = 210, Width = 120, Height = 30 };
        b1.Click += (s, e) => System.Diagnostics.Process.Start(SiteUrl);
        b2.Click += (s, e) => System.Diagnostics.Process.Start(SiteUrl + "?ot");
        var close = new Button { Text = "닫기", Left = 16, Top = 250, Width = 260, Height = 28 };
        close.Click += (s, e) => Close();
        Controls.AddRange(new Control[] { title, big, bar, sub, months, b1, b2, close });
        Shown += (s, e) => Load();
    }

    void Load()
    {
        try
        {
            string url = ApiUrl + "?action=get&key=" + Uri.EscapeDataString("actual/" + uid) +
                         "&pw=" + Uri.EscapeDataString(pw) + "&as=" + Uri.EscapeDataString(uid);
            string body;
            using (var wc = new WebClient { Encoding = System.Text.Encoding.UTF8 }) body = wc.DownloadString(url);
            var ser = new JavaScriptSerializer();
            var j = ser.Deserialize<Dictionary<string, object>>(body);
            if (!(j.ContainsKey("ok") && (bool)j["ok"])) { big.Text = "로그인 실패"; sub.Text = "비밀번호나 사번을 확인해 주세요."; return; }
            SaveLogin(pw, uid);
            var v = j.ContainsKey("value") ? j["value"] as Dictionary<string, object> : null;
            if (v == null) { big.Text = "-"; sub.Text = "하반기 초과근무 기록이 아직 없어요."; return; }

            double total = ToD(v, "total");
            var h = v.ContainsKey("h") ? v["h"] as Dictionary<string, object> : null;
            var parts = new List<string>();
            double used = 0;
            if (h != null)
                foreach (var kv in h.OrderBy(k => int.Parse(k.Key)))
                {
                    double hv = ToD(h, kv.Key);
                    used += hv;
                    parts.Add(kv.Key + "월 " + hv + "h");
                }
            double rem = Math.Round(total - used, 1);
            big.Text = rem + " 시간";
            int pct = total > 0 ? (int)Math.Min(100, Math.Round(used / total * 100)) : 0;
            bar.Value = pct;
            sub.Text = used + " / " + total + " 시간 사용";
            months.Text = string.Join("   ", parts);
        }
        catch (Exception ex)
        {
            big.Text = "불러오지 못했어요";
            sub.Text = ex.Message.Length > 60 ? ex.Message.Substring(0, 60) : ex.Message;
        }
    }

    static double ToD(Dictionary<string, object> d, string k)
    {
        if (d == null || !d.ContainsKey(k) || d[k] == null) return 0;
        double r;
        return double.TryParse(Convert.ToString(d[k]), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out r) ? r : 0;
    }
}
