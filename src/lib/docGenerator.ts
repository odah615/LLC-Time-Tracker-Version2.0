/**
 * Generates and downloads a rich, styled Microsoft Word Document (.doc) containing
 * complete download, installation, demo login credentials, and user workflow instructions.
 */
export function downloadWordDocInstructions(): void {
  const currentOrigin = typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'https://portal.llctimetracker.com';

  const docHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>LLC-Time-Tracker-V2 - Download, Login & User Guide</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1E293B;
      background-color: #FFFFFF;
      margin: 36pt 48pt;
    }
    h1 {
      font-size: 22pt;
      color: #1E3A8A;
      font-weight: 700;
      border-bottom: 2pt solid #2563EB;
      padding-bottom: 6pt;
      margin-top: 0;
      margin-bottom: 12pt;
    }
    h2 {
      font-size: 15pt;
      color: #1E40AF;
      font-weight: 600;
      margin-top: 18pt;
      margin-bottom: 8pt;
      border-bottom: 1pt solid #E2E8F0;
      padding-bottom: 4pt;
    }
    h3 {
      font-size: 12pt;
      color: #0F172A;
      font-weight: 600;
      margin-top: 12pt;
      margin-bottom: 4pt;
    }
    p, li {
      font-size: 10.5pt;
      color: #334155;
    }
    .badge {
      background-color: #EFF6FF;
      color: #1D4ED8;
      font-weight: bold;
      padding: 2pt 6pt;
      border-radius: 4pt;
      border: 1pt solid #BFDBFE;
      font-size: 9pt;
      display: inline-block;
    }
    .badge-pht {
      background-color: #F0FDF4;
      color: #15803D;
      font-weight: bold;
      padding: 2pt 6pt;
      border-radius: 4pt;
      border: 1pt solid #BBF7D0;
      font-size: 9pt;
      display: inline-block;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0 16pt 0;
      font-size: 10pt;
    }
    th {
      background-color: #F1F5F9;
      color: #0F172A;
      font-weight: bold;
      text-align: left;
      padding: 8pt;
      border: 1pt solid #CBD5E1;
    }
    td {
      padding: 7pt 8pt;
      border: 1pt solid #CBD5E1;
      color: #334155;
      vertical-align: middle;
    }
    tr:nth-child(even) td {
      background-color: #F8FAFC;
    }
    .highlight-box {
      background-color: #F0F9FF;
      border-left: 4pt solid #0284C7;
      padding: 10pt 14pt;
      margin: 12pt 0;
      border-radius: 0 6pt 6pt 0;
    }
    code {
      font-family: 'Consolas', 'Courier New', monospace;
      background-color: #F1F5F9;
      padding: 1pt 4pt;
      border-radius: 3pt;
      color: #0F172A;
      font-size: 9.5pt;
    }
    ol, ul {
      margin-top: 4pt;
      margin-bottom: 10pt;
      padding-left: 20pt;
    }
    li {
      margin-bottom: 4pt;
    }
    .footer {
      margin-top: 30pt;
      padding-top: 10pt;
      border-top: 1pt solid #CBD5E1;
      font-size: 9pt;
      color: #64748B;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>LLC-Time-Tracker-V2 - Download, Login & User Guide</h1>
  <p><strong>System Version:</strong> v2.0 Production Edition<br>
  <strong>Primary Timezone:</strong> <span class="badge-pht">Asia/Manila (PHT / UTC+8)</span><br>
  <strong>Web Portal URL:</strong> <code>${currentOrigin}</code></p>

  <div class="highlight-box">
    <strong>Overview:</strong> LLC-Time-Tracker-V2 is an enterprise-grade agent time tracking, activity surveillance, timesheet management, and payroll calculation platform designed for virtual assistant agencies and remote teams.
  </div>

  <h2>1. How to Access the System</h2>
  <h3>Option A: Web Portal (Zero Installation)</h3>
  <p>Open any modern browser and navigate to the application URL:</p>
  <p><code>${currentOrigin}</code></p>

  <h3>Option B: Standalone Desktop Software (Windows / macOS / Linux)</h3>
  <ol>
    <li>Click the <strong>Download Software</strong> button in the top navigation bar.</li>
    <li>Select your Operating System and download the instant launcher or full builder package.</li>
    <li>Double-click the launcher to start your desktop session immediately.</li>
  </ol>

  <div class="footer">
    LLC-Time-Tracker-V2 &bull; Enterprise Workforce Management Solution &bull; Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</body>
</html>
  `;

  const blob = new Blob(['\ufeff' + docHtml], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = 'LLC_Time_Tracker_V2_User_Guide.doc';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}
