<?php
// Einstellungen der Mitgliederecke.
// Diese Datei als "config.php" in denselben Ordner kopieren und ausfüllen.
// config.php NICHT ins GitHub-Repository hochladen (enthält das Discord-Geheimnis).

return [
    // Die Gilden-Homepage (ohne / am Ende). Nur von dort werden Anfragen angenommen.
    'site_origins' => ['https://donnerbalkenklan.free-kick.de'],

    // Discord-App (https://discord.com/developers/applications → eure App → OAuth2)
    'client_id'     => '',
    'client_secret' => '',
    // Muss genau so bei der Discord-App unter "Redirects" eingetragen sein:
    'redirect_uri'  => 'https://free-kick.de/donnerbalken-api/?action=callback',

    // Nur Mitglieder dieses Discord-Servers dürfen sich anmelden
    'guild_id' => '743537404358426735',
    // Optional: nur wer eine dieser Discord-Rollen hat (z. B. Gildenmitglied), darf rein.
    // Leer lassen = alle vom Server. Offiziere und Admins dürfen immer.
    'required_role' => [],

    // Wer Anmeldungen als "erledigt" markieren darf:
    // Discord-Rollen-IDs (z. B. Offiziere) und/oder einzelne Discord-Nutzer-IDs
    'officer_roles' => [],
    'admin_ids'     => ['178409164836569088'],
];
