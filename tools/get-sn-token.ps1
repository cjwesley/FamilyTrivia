# Reads the now-sdk OAuth credential blob from Windows Credential Manager
# (target: now-sdk.ServiceNow) and prints it to stdout as raw text.
#
# Discovered blob shape (2026-07-17, tekvoyantdev, buildSDK profile):
#   The CredentialBlob is UTF-16LE ("Unicode"), NOT UTF-8 -- decoding it as
#   UTF-8 produces a garbled/mojibake string (still JSON-shaped but with a
#   NUL byte between every character). Switched the last line below from
#   [Text.Encoding]::UTF8.GetString($blob) to ::Unicode.GetString($blob).
#   Once correctly decoded, the JSON is an object keyed by auth-profile
#   alias, with the token nested under a "creds" object:
#     {
#       "buildSDK": {
#         "isDefault": true,
#         "alias": "buildSDK",
#         "creds": {
#           "instanceUrl": "https://tekvoyantdev.service-now.com",
#           "type": "oauth",
#           "access_token": "<jwt>",
#           "token_type": "Bearer",
#           "refresh_token": "<opaque>",
#           "expires_at": <epoch ms>
#         }
#       }
#     }
#   The key is already snake_case "access_token" (not camelCase), so
#   snc.mjs's brief-provided regex /"access_token"\s*:\s*"([^"]+)"/ matches
#   this shape as-is -- no regex change was needed, only the encoding fix
#   here.
$sig = @"
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
[DllImport("advapi32.dll")]
public static extern void CredFree(IntPtr cred);
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
"@
Add-Type -MemberDefinition $sig -Name CredMan -Namespace Win32
$ptr = [IntPtr]::Zero
if (-not [Win32.CredMan]::CredRead('now-sdk.ServiceNow', 1, 0, [ref]$ptr)) { throw 'now-sdk credential not found' }
$cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][Win32.CredMan+CREDENTIAL])
$blob = New-Object byte[] $cred.CredentialBlobSize
[System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blob, 0, $cred.CredentialBlobSize)
[Win32.CredMan]::CredFree($ptr)
[Text.Encoding]::Unicode.GetString($blob)
