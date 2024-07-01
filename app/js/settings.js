
const Settings = (() => {
    "use strict"

    const settings = require("electron-settings");
    const path = require("path");
    const { homedir } = require("os");

    const DownloadType = Object.freeze({
        Both: 0,
        OnlyLectures: 1,
        OnlyAttachments: 2
    });

    const DownloadDefaultOptions = Object.freeze({
        checkNewVersion: true,
        autoStartDownload: false,
        continueDonwloadingEncrypted: false,
        enableDownloadStartEnd: false,
        type: DownloadType.Both,
        skipSubtitles: false,
        autoRetry: false,
        downloadStart: 0,
        downloadEnd: 0,
        videoQuality: "Auto",
        path: path.join(homedir(), "Downloads", "Udeler"),
        defaultSubtitle: undefined,
        seqZeroLeft: false,
    });

    let _language = null;
    let _prettify = false;

    /**
     * Ensures all default keys are set in the settings
     * @internal
     * @returns {void}
     */
    function ensureDefaultKeys() {
        if (!settings.get("language")) {
            settings.set("language", getLanguage());
        }

        if (!settings.get("download")) {
            settings.set("download", DownloadDefaultOptions);
        } else {
            // certifica que exista todas as propriedades
            Object.keys(DownloadDefaultOptions).forEach(key => {
                settings.get(`download.${key}`, DownloadDefaultOptions[key]);
            });
        }
    }

    /**
     * Get navigator default language and set in settings "language"
     *
     * @returns defined language
     */
    function getLanguage() {
        try {
            let language = settings.get("language");

            if (!language) {
                const navigatorLang = navigator.language.substring(0, 2);
                const meta = require("../locale/meta.json");

                language = Object.keys(meta).find(key => meta[key] === (navigatorLang === 'pt' ? 'pt_BR.json' : `${navigatorLang}.json`));

                if (language) {
                    settings.set("language", language, { prettify: _prettify });
                }
            }

            return language || "English";

        } catch (error) {
            console.error("Error_Settings getLanguage(): " + error);
            return "English";
        }
    }

    /**
     * Get the download directory for a given course
     * @param {string} courseName - The name of the course
     * @returns {string} - The download directory path
     */
    function downloadDirectory(courseName = "") {
        const download_dir = settings.get("download.path") || DownloadDefaultOptions.path;
        return path.join(download_dir, courseName);
    }

    // Initialize settings
    (function init() {
        console.log('Initialize settings');
        _prettify = process.env.PRETTIFY_SETTINGS || false;
        ensureDefaultKeys();
    })();

    return {
        DownloadType,
        DownloadDefaultOptions,
        /** @param {String, Object} */
        get: (keyPath, defaultValue = undefined) => settings.get(keyPath, defaultValue),
        /** @param {String, Object} */
        set: (keyPath, value) => settings.set(keyPath, value, { prettify: _prettify }),
        /** @type {string} */
        get language() {
            if (!_language) {
                _language = getLanguage();
            }
            return _language;
        },
        /** @type {string} */
        set language(value) {
            this.set("language", value || null);
            _language = value;
        },
        /** @type {string} */
        get subDomain() {
            return this.get("subdomain", "www");
        },
        /** @type {string} */
        set subDomain(value) {
            this.set("subdomain", value);
        },
        /** @type {string} */
        get accessToken() {
            return this.get("access_token");
        },
        /** @type {string} */
        set accessToken(value) {
            this.set("access_token", value || null);
        },
        /** @type {boolean} */
        get subscriber() {
            return Boolean(this.get("subscriber"));
        },
        /** @type {boolean} */
        set subscriber(value) {
            this.set("subscriber", value);
        },
        /** @type {Object} */
        get download() {
            return this.get("download");
        },
        /** @type {Object} */
        set download(value) {
            this.set("download", value);
        },
        /** @type {Object} */
        get downloadHistory() {
            return this.get("downloadedHistory");
        },
        /** @type {Object} */
        set downloadHistory(value) {
            this.set("downloadedHistory", value);
        },
        /** @type {Object} */
        get downloadedCourses() {
            return this.get("downloadedCourses");
        },
        /** @type {Object} */
        set downloadedCourses(value) {
            this.set("downloadedCourses", value);
        },
        /** @param {String} */
        downloadDirectory: (courseName) => downloadDirectory(courseName),
    };
})();

module.exports = Settings;
