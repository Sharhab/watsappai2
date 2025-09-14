// loadGoogleCredentials.js
// export function loadGoogleCredentials() {
//   return {
//     type: process.env["gcp-type"],
//     project_id: process.env["gcp-project_id"],
//     private_key_id: process.env["gcp-private_key_id"],
//     private_key: process.env["gcp-private_key"]?.replace(/\\n/g, '\n'),
//     client_email: process.env["gcp-client_email"],
//     client_id: process.env["gcp-client_id"],
//     auth_uri: process.env["gcp-auth_uri"],
//     token_uri: process.env["gcp-token_uri"],
//     auth_provider_x509_cert_url: process.env["gcp-auth_provider_x509_cert_url"],
//     client_x509_cert_url: process.env["gcp-client_x509_cert_url"],
//     universe_domain: process.env["gcp-universe_domain"],
//   };
// }

module.exports = { loadGoogleCredentials }