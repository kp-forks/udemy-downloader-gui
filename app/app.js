"use strict";

const { shell, remote, ipcRenderer } = require("electron");
const { dialog, BrowserWindow } = remote;
const axios = require("axios");
const fs = require("fs");

const prompt = require("dialogs")({});

const sanitize = require("sanitize-filename");
const vtt2srt = require("node-vtt-to-srt");
const Downloader = require("mt-files-downloader");
const https = require("https");
const cookie = require("cookie");
const utils = require("./js/utils");
const ui = require("./js/ui");

const pageSize = 25;
const msgDRMProtected = translate("Contains DRM protection and cannot be downloaded");
const ajaxTimeout = 40000; // 40 segundos

let loggers = [];
let headersAuth;
let repoAccount = "heliomarpm";

// require('auto_authenticator.js');

ipcRenderer.on("saveDownloads", function () {
    saveDownloads(true);
});

// external browser
// $(document).on('click', 'a[href^="http"]', (event) => {
$(document).on("click", ".how-get-token", (event) => {
    event.preventDefault();
    shell.openExternal(event.target.href);
});

$(".ui.dropdown").dropdown();

$(document).ajaxError(function (_event, _request) {
    $(".dimmer").removeClass("active");
});

$(".ui.login #business").change(function () {
    if ($(this).is(":checked")) {
        ui.$subdomainField.val(Settings.subDomain);
        ui.toggleSubdomainField(true);
    } else {
        ui.$subdomainField.val(null);
        ui.toggleSubdomainField(false);
    }
});

$(".ui.dashboard .content").on("click", ".open-in-browser", function () {
    const link = `https://${Settings.subDomain}.udemy.com${$(this).parents(".course.item").attr("course-url")}`;
    console.log("open", link);
    shell.openExternal(link);
});

$(".ui.dashboard .content").on("click", ".open-dir", function () {
    const pathDownloaded = $(this).parents(".course.item").find('input[name="path-downloaded"]').val();
    shell.openPath(pathDownloaded);
});

$(".ui.dashboard .content").on("click", ".dismiss-download", function () {
    const courseId = $(this).parents(".course.item").attr("course-id");
    removeCurseDownloads(courseId);
});

$(".ui.dashboard .content").on("click", ".load-more.button", () => loadMore($(this)));

$(".ui.dashboard .content").on("click", ".check-updates", function () {
    checkUpdate("heliomarpm");
});

$(".ui.dashboard .content").on("click", ".check-updates-original", function () {
    checkUpdate("FaisalUmair");
});

$(".ui.dashboard .content").on("click", ".old-version-mac", function () {
    shell.openExternal("https://github.com/FaisalUmair/udemy-downloader-gui/releases/download/v1.8.2/Udeler-1.8.2-mac.dmg");
});

$(".ui.dashboard .content").on("click", ".old-version-linux", function () {
    shell.openExternal("https://github.com/FaisalUmair/udemy-downloader-gui/releases/download/v1.8.2/Udeler-1.8.2-linux-x86_x64.AppImage");
});

$(".download-update.button").click(function () {
    shell.openExternal(`https://github.com/${repoAccount}/udemy-downloader-gui/releases/latest`);
});

$(".ui.dashboard .content .courses.section .search.form").submit(function (e) {
    e.preventDefault();
    const keyword = $(e.target).find("input").val();
    search(keyword);
});

$(".ui.dashboard .content").on("click", ".download-success, .course-encrypted", function () {
    $(this).hide();
    $(this).parents(".course").find(".download-status").show();
});

$(".ui.dashboard .content").on("click", ".download.button, .download-error", function (e) {
    e.stopImmediatePropagation();
    downloadButtonClick($(this).parents(".course"));
});

$(".ui.dashboard .content").on("click", "#clear_logger", clearLogArea);

$(".ui.dashboard .content").on("click", "#save_logger", saveLogFile);

$(".courses-sidebar").click(function () {
    $(".content .ui.section").hide();
    $(".content .ui.courses.section").show();
    $(this).parent(".sidebar").find(".active").removeClass("active purple");
    $(this).addClass("active purple");
});

$(".downloads-sidebar").click(function () {
    ui.dimmerDownloads(true);
    $(".content .ui.section").hide();
    $(".content .ui.downloads.section").show();
    $(this).parent(".sidebar").find(".active").removeClass("active purple");
    $(this).addClass("active purple");

    rendererDownloads();
});

$(".settings-sidebar").click(function () {
    $(".content .ui.section").hide();
    $(".content .ui.settings.section").show();
    $(this).parent(".sidebar").find(".active").removeClass("active purple");
    $(this).addClass("active purple");

    loadSettings();
});

$(".about-sidebar").click(function () {
    $(".content .ui.section").hide();
    $(".content .ui.about.section").show();
    $(this).parent(".sidebar").find(".active").removeClass("active purple");
    $(this).addClass("active purple");
});

$(".logger-sidebar").click(function () {
    $(".content .ui.section").hide();
    $(".content .ui.logger.section").show();
    $(this).parent(".sidebar").find(".active").removeClass("active purple");
    $(this).addClass("active purple");

    clearBagdeLoggers();
});

$(".logout-sidebar").click(function () {
    prompt.confirm(translate("Confirm Log Out?"), function (ok) {
        if (ok) {
            ui.dimmerLogout(true);
            saveDownloads(false);
            Settings.accessToken = null;
            ui.resetToLogin();
        }
    });
});

$(".content .ui.about").on("click", 'a[href^="http"]', function (e) {
    e.preventDefault();
    shell.openExternal(this.href);
});

$(".ui.settings .form").submit((e) => {
    e.preventDefault();
    saveSettings(e.target);
});

const $settingsForm = $(".ui.settings .form");

$settingsForm.find('input[name="enabledownloadstartend"]').change(function () {
    $settingsForm.find('input[name="downloadstart"], input[name="downloadend"]').prop("readonly", !this.checked);
});

function loadSettings() {
    $settingsForm.find('input[name="check-new-version"]')
        .prop("checked", Boolean(Settings.download.checkNewVersion));
    $settingsForm.find('input[name="auto-start-download"]')
        .prop("checked", Boolean(Settings.download.autoStartDownload));
    $settingsForm.find('input[name="continue-downloading-encrypted"]')
        .prop("checked", Boolean(Settings.download.continueDonwloadingEncrypted));

    $settingsForm.find('input[name="enabledownloadstartend"]')
        .prop("checked", Boolean(Settings.download.enableDownloadStartEnd));
    $settingsForm.find('input[name="downloadstart"], input[name="downloadend"]')
        .prop("readonly", !Boolean(Settings.download.enableDownloadStartEnd));

    $settingsForm.find('input:radio[name="downloadType"]')
        .filter(`[value="${Settings.download.type}"]`).prop("checked", true);
    $settingsForm.find('input[name="skipsubtitles"]')
        .prop("checked", Boolean(Settings.download.skipSubtitles));
    $settingsForm.find('input[name="autoretry"]')
        .prop("checked", Boolean(Settings.download.autoRetry));
    $settingsForm.find('input[name="seq-zero-left"]')
        .prop("checked", Boolean(Settings.download.seqZeroLeft));

    $settingsForm.find('input[name="downloadpath"]').val(Settings.downloadDirectory());
    $settingsForm.find('input[name="downloadstart"]').val(Settings.download.downloadStart);
    $settingsForm.find('input[name="downloadend"]').val(Settings.download.downloadEnd);

    const videoQuality = Settings.download.videoQuality;
    $settingsForm.find('input[name="videoquality"]').val(videoQuality);
    $settingsForm.find('input[name="videoquality"]')
        .parent(".dropdown").find(".default.text")
        .html(translate(videoQuality || "Auto"));

    const language = Settings.language;
    $settingsForm.find('input[name="language"]').val(language || "");
    $settingsForm.find('input[name="language"]')
        .parent(".dropdown").find(".default.text")
        .html(language || "English");

    const defaultSubtitle = Settings.download.defaultSubtitle;
    $settingsForm.find('input[name="defaultSubtitle"]').val(defaultSubtitle || "");
    $settingsForm.find('input[name="defaultSubtitle"]')
        .parent(".dropdown").find(".defaultSubtitle.text")
        .html(defaultSubtitle || "");
}

function saveSettings(formElement) {
    const findInput = (inputName, attr = "") => $(formElement).find(`input[name="${inputName}"]${attr}`);

    const def = Settings.DownloadDefaultOptions;

    const checkNewVersion = findInput("check-new-version")[0].checked ?? def.checkNewVersion;
    const autoStartDownload = findInput("auto-start-download")[0].checked ?? def.autoStartDownload;
    const continueDonwloadingEncrypted = findInput("continue-downloading-encrypted")[0].checked ?? def.continueDonwloadingEncrypted;
    const enableDownloadStartEnd = findInput("enabledownloadstartend")[0].checked ?? def.enableDownloadStartEnd;
    const downloadType = findInput("downloadType", ":checked").val() ?? def.type;
    const skipSubtitles = findInput("skipsubtitles")[0].checked ?? def.skipSubtitles;
    const autoRetry = findInput("autoretry")[0].checked ?? def.autoRetry;
    const downloadStart = parseInt(findInput("downloadstart").val() ?? def.downloadStart);
    const downloadEnd = parseInt(findInput("downloadend").val() ?? def.downloadEnd);
    const videoQuality = findInput("videoquality").val() ?? def.videoQuality;
    const downloadPath = findInput("downloadpath").val() ?? def.path;
    const language = findInput("language").val() ?? undefined;
    const defaultSubtitle = findInput("defaultSubtitle").val() ?? def.defaultSubtitle;
    const seqZeroLeft = findInput("seq-zero-left")[0].checked ?? def.seqZeroLeft;

    Settings.download = {
        checkNewVersion,
        autoStartDownload,
        continueDonwloadingEncrypted,
        enableDownloadStartEnd,
        type: Number(downloadType),
        skipSubtitles,
        autoRetry,
        downloadStart,
        downloadEnd,
        videoQuality,
        path: downloadPath,
        defaultSubtitle,
        seqZeroLeft,
    };

    Settings.language = language;

    prompt.alert(translate("Settings Saved"));
}

function selectDownloadPath() {
    const path = dialog.showOpenDialogSync({
        properties: ["openDirectory"],
    });

    if (path && path[0]) {
        fs.access(path[0], fs.constants.R_OK && fs.constants.W_OK, function (err) {
            if (err) {
                prompt.alert(translate("Cannot select this folder"));
            } else {
                $settingsForm.find('input[name="downloadpath"]').val(path[0]);
            }
        });
    }
}

function checkUpdate(account, silent = false) {
    console.log("checkUpdate", { account, silent });

    ui.dimmerCheckUpdate(true);

    try {
        $.getJSON(`https://api.github.com/repos/${account}/udemy-downloader-gui/releases/latest`, function (response) {
            if (response.tag_name != `v${appVersion}`) {
                repoAccount = account;
                $(".ui.update-available.modal").modal("show");
            } else {
                if (!silent) {
                    prompt.alert(translate("No updates available"));
                }
            }
        });
    } catch (error) {
        console.error("Failed to check for updates", error);
        if (!silent) {
            prompt.alert(translate("Failed to check for updates"));
        }
    } finally {
        ui.dimmerCheckUpdate(false);
    }
}

function checkLogin() {
    if (Settings.accessToken) {
        ui.dimmerLogin(true);

        headersAuth = { Authorization: `Bearer ${Settings.accessToken}` };

        let url = "https://www.udemy.com/api-2.0/contexts/me/?header=True";
        console.log("checkLogin", { url, headersAuth });

        axios({
            timeout: ajaxTimeout,
            type: "GET",
            url,
            headers: headersAuth,
        }).then((response) => {
            ui.dimmerLogin(false);
            ui.showDashboard();

            const resp = response.data;

            const subscriber = utils.toBoolean(resp.header.user.enableLabsInPersonalPlan);
            Settings.subscriber = subscriber;
            url = !subscriber
                ? `https://${Settings.subDomain}.udemy.com/api-2.0/users/me/subscribed-courses?page_size=${pageSize}&page_size=30&ordering=-last_accessed`
                : `https://${Settings.subDomain}.udemy.com/api-2.0/users/me/subscription-course-enrollments?page_size=${pageSize}&page_size=30&ordering=-last_accessed`;

            axios({
                timeout: ajaxTimeout,
                type: "GET",
                url,
                headers: headersAuth,
            }).then((response) => {
                rendererCourse(response.data);

                if (Settings.downloadedCourses) {
                    rendererDownloads();
                }

                if (Settings.download.checkNewVersion) {
                    checkUpdate(repoAccount, true);
                }
            }).catch((error) => {
                console.error("beforeLogin_Error:", error);
                prompt.alert(error.message);
            });
        }).catch((error) => {
            console.error("checkLogin_Error:", error);
            prompt.alert(error.message);
            if (!process.env.DEBUG_MODE) Settings.accessToken = null;

            ui.resetToLogin();
        }).finally(() => {
            console.log("login finish");
            console.log("access-token", Settings.accessToken);
            ui.dimmerLogin(false);
        });
    }
}

function loginWithUdemy() {
    const $formLogin = $(".ui.login .form");

    if ($formLogin.find('input[name="business"]').is(":checked")) {
        if (!ui.$subdomainField.val()) {
            prompt.alert("Type Business Name");
            return;
        }
    } else {
        ui.$subdomainField.val(null);
    }

    const parent = remote.getCurrentWindow();
    const dimensions = parent.getSize();
    const session = remote.session;
    let udemyLoginWindow = new BrowserWindow({
        width: dimensions[0] - 100,
        height: dimensions[1] - 100,
        parent,
        modal: true,
    });

    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["*://*.udemy.com/*"] }, function (request, callback) {
        const token = request.requestHeaders.Authorization
            ? request.requestHeaders.Authorization.split(" ")[1]
            : cookie.parse(request.requestHeaders.Cookie || "").access_token;

        if (token) {
            Settings.accessToken = token;
            Settings.subDomain = new URL(request.url).hostname.split(".")[0];

            udemyLoginWindow.destroy();
            session.defaultSession.clearStorageData();
            session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["*://*.udemy.com/*"] }, function (request, callback) {
                callback({ requestHeaders: request.requestHeaders });
            });
            checkLogin();
        }
        callback({ requestHeaders: request.requestHeaders });
    });

    Settings.subDomain = ui.$subdomainField.val() ?? "www";

    if (ui.$subdomainField.val()) {
        udemyLoginWindow.loadURL(`https://${Settings.subDomain}.udemy.com`);
    } else {
        udemyLoginWindow.loadURL("https://www.udemy.com/join/login-popup");
    }
}

function loginWithAccessToken() {
    const $formLogin = $(".ui.login .form");

    if ($formLogin.find('input[name="business"]').is(":checked")) {
        if (!ui.$subdomainField.val()) {
            prompt.alert("Type Business Name");
            return;
        }
    } else {
        ui.$subdomainField.val("www");
    }

    prompt.prompt("Access Token", (access_token) => {
        if (access_token) {
            const submain = ui.$subdomainField.val();
            Settings.accessToken = access_token;
            Settings.subDomain = submain.trim().length == 0 ? "www" : submain.trim();

            checkLogin();
        }
    });
}

function htmlCourseCard(course, downloadSection = false) {
    if (!course.completed) {
        course.completed = false;
    }
    course.infoDownloaded = "";
    course.encryptedVideos = 0;
    course.pathDownloaded = "";

    const history = getDownloadHistory(course.id);
    if (history) {
        course.infoDownloaded = translate(history.completed ? "Download finished on" : "Download started since") + " " + history.date;
        course.completed = history.completed ? true : course.completed;
        course.encryptedVideos = history.encryptedVideos ?? 0;
        course.selectedSubtitle = history.selectedSubtitle ?? "";
        course.pathDownloaded = history.pathDownloaded ?? "";
    }

    // Se o caminho não existir, obtenha o caminho de configurações de download para o título do curso
    if (!fs.existsSync(course.pathDownloaded))
        course.pathDownloaded = Settings.downloadDirectory(sanitize(course.title));

    const tagDismiss = `<a class="ui basic dismiss-download">${translate("Dismiss")}</a>`;

    const $course = $(`
        <div class="ui course item" course-id="${course.id}" course-url="${course.url}" course-completed="${course.completed}">
            <input type="hidden" name="encryptedvideos" value="${course.encryptedVideos}">
            <input type="hidden" name="selectedSubtitle" value="${course.selectedSubtitle}">
            <input type="hidden" name="path-downloaded" value="${course.pathDownloaded}">

            <div class="ui tiny label download-quality grey"></div>
            <div class="ui tiny grey label download-speed">
                <span class="value">0</span>
                <span class="download-unit"> KB/s</span>
            </div>

            <div class="ui tiny image wrapper">
                <div class="ui red left corner label icon-encrypted">
                    <i class="lock icon"></i>
                </div>
                <img src="${course.image ?? course.image_240x135}" class="course-image border-radius" />
                ${downloadSection ? tagDismiss : ""}
                <div class="tooltip">${course.encryptedVideos == 0 ? "" : msgDRMProtected}</div>
            </div>

            <div class="content">
                <span class="coursename">${course.title}</span>
                <div class="ui tiny icon green download-success message">
                    <i class="check icon"></i>
                    <div class="content">
                        <div class="headers">
                            <h4>${translate("Download Finished")}</h4>
                        </div>
                        <p>${translate("Click to dismiss")}</p>
                    </div>
                </div>
                <div class="ui tiny icon red download-error message">
                    <i class="bug icon"></i>
                    <div class="content">
                        <div class="headers">
                            <h4>${translate("Download Failed")}</h4>
                        </div>
                        <p>${translate("Click to retry")}</p>
                    </div>
                </div>
                <div class="ui tiny icon purple course-encrypted message">
                    <i class="lock icon"></i>
                    <div class="content">
                        <div class="headers">
                            <h4>${msgDRMProtected}</h4>
                        </div>
                        <p>${translate("Click to dismiss")}</p>
                    </div>
                </div>

                <div class="extra download-status">
                    ${ui.actionCardTemplate}
                </div>
                <!-- <div style="margin-top:15px"><span class="lecture-name"></span></div> -->
            </div>
        </div>`);

    if (!downloadSection) {
        if (course.completed) {
            resetCourse($course, $course.find(".download-success"));
        } else if (course.encryptedVideos > 0) {
            resetCourse($course, $course.find(".course-encrypted"));
        } else {
            $course.find(".info-downloaded").html(course.infoDownloaded).show();
        }
    } else {
        if (course.completed) {
            $course.find(".info-downloaded")
                .html("<span style='color: #46C855'>" + course.infoDownloaded + "</span>")
                .show();
        } else {
            $course.find(".individual.progress").progress({ percent: course.individualProgress }).show();
            $course.find(".combined.progress").progress({ percent: course.combinedProgress }).show();
            $course.find(".download-status .label").html(course.progressStatus);
            $course.find(".info-downloaded").hide();
            $course.css("padding-bottom", "25px");
        }
    }

    if (course.encryptedVideos == "0") {
        $course.find(".icon-encrypted").hide();
        $course.find(".ui.tiny.image .tooltip").hide();
        $course.find(".ui.tiny.image").removeClass("wrapper");
    } else {
        $course.find(".icon-encrypted").show();
        $course.find(".ui.tiny.image .tooltip").show();
        $course.find(".ui.tiny.image").addClass("wrapper");
    }

    if (!fs.existsSync(course.pathDownloaded)) {
        $course.find(".open-dir.button").hide();
    }

    return $course;
}

function downloadButtonClick($course, subtitle) {
    ui.prepareDownload($course);

    const courseId = $course.attr("course-id");

    const skipSubtitles = Boolean(Settings.download.skipSubtitles);
    const defaultSubtitle = skipSubtitles ? null : subtitle ?? Settings.download.defaultSubtitle;
    const downloadType = Number(Settings.download.type);

    const url = `https://${Settings.subDomain}.udemy.com/api-2.0/courses/${courseId}/cached-subscriber-curriculum-items?page_size=10000`;

    console.clear();
    console.log("downloadButtonClick", url);

    ui.dimmerPrepareDownload(true);
    axios({
        timeout: ajaxTimeout,
        type: "GET",
        url,
        headers: headersAuth,
    }).then((response) => {
        const resp = response.data;

        ui.enableDownloadButton($course, false);
        ui.showProgress($course, true);

        const courseData = [];
        courseData["id"] = courseId;
        courseData["chapters"] = [];
        courseData["name"] = $course.find(".coursename").text();
        courseData["totalLectures"] = 0;
        courseData["encryptedVideos"] = 0;
        courseData["errorCount"] = 0;

        let chapterIndex = -1;
        let lectureIndex = -1;
        let remaining = resp.count;
        let availableSubs = [];

        if (resp.results[0]._class == "lecture") {
            chapterIndex++;
            lectureIndex = 0;
            courseData["chapters"][chapterIndex] = [];
            courseData["chapters"][chapterIndex]["name"] = "Chapter 1";
            courseData["chapters"][chapterIndex]["lectures"] = [];
            remaining--;
        }

        $.each(resp.results, function (i, v) {
            if (v._class.toLowerCase() == "chapter") {
                chapterIndex++;
                lectureIndex = 0;
                courseData["chapters"][chapterIndex] = [];
                courseData["chapters"][chapterIndex]["name"] = v.title;
                courseData["chapters"][chapterIndex]["lectures"] = [];
                remaining--;
            } else if (
                v._class.toLowerCase() == "lecture" &&
                (v.asset.asset_type.toLowerCase() == "video" ||
                    v.asset.asset_type.toLowerCase() == "article" ||
                    v.asset.asset_type.toLowerCase() == "file" ||
                    v.asset.asset_type.toLowerCase() == "e-book")
            ) {
                if (v.asset.asset_type.toLowerCase() != "video" && downloadType == Settings.DownloadType.OnlyLectures) {
                    //skipAttachments) {
                    remaining--;
                    if (!remaining) {
                        if (Object.keys(availableSubs).length) {
                            askForSubtitle(availableSubs, initDownload, $course, courseData, defaultSubtitle);
                        } else {
                            initDownload($course, courseData);
                        }
                    }
                    return;
                }

                function getLecture(lectureName, chapterIndex, lectureIndex) {
                    const url = `https://${Settings.subDomain}.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${v.id}?fields[lecture]=asset,supplementary_assets&fields[asset]=stream_urls,download_urls,captions,title,filename,data,body,media_sources,media_license_token`;
                    console.log("getLecture", url);

                    axios({
                        timeout: ajaxTimeout,
                        type: "GET",
                        url,
                        headers: headersAuth,
                    }).then((response) => {
                        const resp = response.data;

                        var src = "";
                        var videoQuality = "";
                        var type = "";

                        if (v.asset.asset_type.toLowerCase() == "article") {
                            if (resp.asset.data) {
                                src = resp.asset.data.body;
                            } else {
                                src = resp.asset.body;
                            }
                            videoQuality = v.asset.asset_type;
                            type = "Article";
                        } else if (v.asset.asset_type.toLowerCase() == "file" || v.asset.asset_type.toLowerCase() == "e-book") {
                            src = resp.asset.download_urls[v.asset.asset_type][0].file;
                            videoQuality = v.asset.asset_type;
                            type = "File";
                        } else {
                            var qualities = [];
                            var qualitySrcMap = {};

                            const medias = resp.asset.stream_urls?.Video ?? resp.asset.media_sources;
                            medias.forEach(function (val) {
                                if (val.type != "application/dash+xml") {
                                    if (val.label.toLowerCase() != "auto") {
                                        qualities.push(val.label);
                                    }
                                    qualitySrcMap[val.label] = val.file ?? val.src;
                                }
                            });

                            const lowest = Math.min(...qualities);
                            const highest = Math.max(...qualities);

                            // if (qualities.length == 0 && Settings.download.videoQuality == "Highest")
                            //   qualities.push("highest");
                            videoQuality = (qualities.length == 0 ? "Auto" : Settings.download.videoQuality).toString();
                            type = "Video";
                            src = medias[0].src ?? medias[0].file;

                            switch (videoQuality.toLowerCase()) {
                                case "auto":
                                    videoQuality = medias[0].label;
                                    break;
                                // case "highest":
                                //   src = qualitySrcMap[highest];
                                //   videoQuality = highest;
                                //   break;
                                case "lowest":
                                    src = qualitySrcMap[lowest];
                                    videoQuality = lowest;
                                    break;
                                case "highest":
                                    // has stream use it otherwise user highest quality
                                    if (qualitySrcMap["Auto"]) {
                                        src = qualitySrcMap["Auto"];
                                    } else {
                                        src = qualitySrcMap[highest];
                                        videoQuality = highest;
                                    }
                                    break;
                                default:
                                    videoQuality = videoQuality.slice(0, -1);
                                    if (qualitySrcMap[videoQuality]) {
                                        src = qualitySrcMap[videoQuality];
                                    } else {
                                        videoQuality = medias[0].label;
                                    }
                            }
                        }

                        courseData["chapters"][chapterIndex]["lectures"][lectureIndex] = {
                            src: src,
                            name: lectureName,
                            quality: videoQuality,
                            type: type,
                        };

                        if (!skipSubtitles && resp.asset.captions.length) {
                            courseData["chapters"][chapterIndex]["lectures"][lectureIndex].caption = [];

                            resp.asset.captions.forEach(function (caption) {
                                caption.video_label in availableSubs
                                    ? (availableSubs[caption.video_label] = availableSubs[caption.video_label] + 1)
                                    : (availableSubs[caption.video_label] = 1);

                                courseData["chapters"][chapterIndex]["lectures"][lectureIndex].caption[caption.video_label] =
                                    caption.url;
                            });
                        }

                        if (resp.supplementary_assets.length && downloadType != Settings.DownloadType.OnlyLectures) {
                            //!skipAttachments) {
                            courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["supplementary_assets"] = [];
                            var supplementary_assets_remaining = resp.supplementary_assets.length;

                            $.each(resp.supplementary_assets, function (a, b) {
                                const url = `https://${Settings.subDomain}.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${v.id}/supplementary-assets/${b.id}?fields[asset]=download_urls,external_url,asset_type`;
                                console.log("getLecture&Attachments", url);

                                axios({
                                    timeout: ajaxTimeout,
                                    type: "GET",
                                    url,
                                    headers: headersAuth,
                                }).then((response) => {
                                    const resp = response.data;

                                    console.log("carregando anexos");
                                    if (resp.download_urls) {
                                        courseData["chapters"][chapterIndex]["lectures"][lectureIndex][
                                            "supplementary_assets"
                                        ].push({
                                            src: resp.download_urls[resp.asset_type][0].file,
                                            name: b.title,
                                            quality: "Attachment",
                                            type: "File",
                                        });
                                    } else {
                                        courseData["chapters"][chapterIndex]["lectures"][lectureIndex][
                                            "supplementary_assets"
                                        ].push({
                                            src: `<script type="text/javascript">window.location = "${resp.external_url}";</script>`,
                                            name: b.title,
                                            quality: "Attachment",
                                            type: "Url",
                                        });
                                    }
                                    supplementary_assets_remaining--;
                                    if (!supplementary_assets_remaining) {
                                        remaining--;
                                        courseData["totalLectures"] += 1;

                                        if (!remaining) {
                                            console.log("download de video anexo", courseData);
                                            if (Object.keys(availableSubs).length) {
                                                askForSubtitle(availableSubs, initDownload, $course, courseData, defaultSubtitle);
                                            } else {
                                                initDownload($course, courseData);
                                            }
                                        }
                                    }
                                }).catch((error) => {
                                    const statusCode = error.response ? error.response.status : 0;
                                    appendLog(`getLectureAndAttachments_Error: ${error.code}(${statusCode})`, error.message);
                                    resetCourse($course, $course.find(".download-error"), false, courseData);
                                });
                            });
                        } else {
                            remaining--;
                            courseData["totalLectures"] += 1;

                            if (!remaining) {
                                if (Object.keys(availableSubs).length) {
                                    askForSubtitle(availableSubs, initDownload, $course, courseData, defaultSubtitle);
                                } else {
                                    initDownload($course, courseData);
                                }
                            }
                        }
                    }).catch((error) => {
                        const statusCode = error.response ? error.response.status : 0;
                        appendLog(`getLecture_Error: ${error.code}(${statusCode})`, error.message);
                        resetCourse($course, $course.find(".download-error"), false, courseData);
                    });
                }

                getLecture(v.title, chapterIndex, lectureIndex);
                lectureIndex++;
            } else if (downloadType != Settings.DownloadType.OnlyLectures) {
                //(!skipAttachments) {
                const srcUrl = `https://${Settings.subDomain}.udemy.com${$course.attr("course-url")}t/${v._class}/${v.id}`;

                // Adiciona um chapter default, para cursos que tem apenas quiz
                if (courseData["chapters"].length === 0) {
                    chapterIndex++;
                    lectureIndex = 0;
                    courseData["chapters"][chapterIndex] = [];
                    courseData["chapters"][chapterIndex]["name"] = "Chapter 0";
                    courseData["chapters"][chapterIndex]["lectures"] = [];
                }

                courseData["chapters"][chapterIndex]["lectures"][lectureIndex] = {
                    src: `<script type="text/javascript">window.location = "${srcUrl}";</script>`,
                    name: v.title,
                    quality: "Attachment",
                    type: "Url",
                };
                remaining--;
                courseData["totalLectures"] += 1;

                if (!remaining) {
                    if (Object.keys(availableSubs).length) {
                        askForSubtitle(availableSubs, initDownload, $course, courseData, defaultSubtitle);
                    } else {
                        initDownload($course, courseData);
                    }
                }
                lectureIndex++;
            } else {
                remaining--;

                if (!remaining) {
                    if (Object.keys(availableSubs).length) {
                        askForSubtitle(availableSubs, initDownload, $course, courseData, defaultSubtitle);
                    } else {
                        initDownload($course, courseData);
                    }
                }
            }
        });
    }).catch((error) => {
        let msgError;
        const statusCode = error.response?.status || error?.code || 0;
        switch (statusCode) {
            case 403:
                msgError = translate("You do not have permission to access this course") + `\nId: ${courseId}`;
                prompt.alert(msgError);
                break;
            case 504:
                msgError = "Gateway timeout";
                break;
            default:
                msgError = error.message;
                break;
        }

        appendLog(`download_Error: ${error.code}(${statusCode})`, msgError);

        ui.enableDownloadButton($course, true);
        ui.showProgress($course, false);
    }).finally(() => {
        ui.dimmerPrepareDownload(false);
    });
}

function initDownload($course, courseData, subTitle = "") {
    const $clone = $course.clone();
    const subtitle = (Array.isArray(subTitle) ? subTitle[0] : subTitle).split("|");
    const $downloads = $(".ui.downloads.section .ui.courses.items");
    const $courses = $(".ui.courses.section .ui.courses.items");

    $course.find('input[name="selectedSubtitle"]').val(subtitle);
    if ($course.parents(".courses.section").length) {
        const $downloadItem = $downloads.find("[course-id=" + $course.attr("course-id") + "]");
        if ($downloadItem.length) {
            $downloadItem.replaceWith($clone);
        } else {
            $downloads.prepend($clone);
        }
    } else {
        const $courseItem = $courses.find("[course-id=" + $course.attr("course-id") + "]");
        if ($courseItem.length) {
            $courseItem.replaceWith($clone);
        }
    }
    $course.push($clone[0]);
    var timer;
    const downloader = new Downloader();
    const $actionButtons = $course.find(".action.buttons");
    const $pauseButton = $actionButtons.find(".pause.button");
    const $resumeButton = $actionButtons.find(".resume.button");
    const lectureChapterMap = {};
    const labelColorMap = {
        144: "purple",
        240: "orange",
        360: "blue",
        480: "teal",
        720: "olive",
        1080: "green",
        Highest: "green",
        auto: "red",
        Attachment: "pink",
        Subtitle: "black",
    };
    let currentLecture = 0;
    courseData["chapters"].forEach(function (lecture, chapterIndex) {
        lecture["lectures"].forEach(function (x, lectureIndex) {
            currentLecture++;
            lectureChapterMap[currentLecture] = { chapterIndex, lectureIndex };
        });
    });

    const courseName = sanitize(courseData["name"]); //, { replacement: (s) => "? ".indexOf(s) > -1 ? "" : "-", }).trim();
    const $progressCombined = $course.find(".combined.progress");
    const $progressIndividual = $course.find(".individual.progress");

    const $downloadSpeed = $course.find(".download-speed");
    const $downloadSpeedValue = $downloadSpeed.find(".value");
    const $downloadSpeedUnit = $downloadSpeed.find(".download-unit");
    const $downloadQuality = $course.find(".download-quality");

    $course.css("cssText", "padding-top: 35px !important").css("padding-bottom", "25px");

    const downloadDirectory = Settings.downloadDirectory();
    $course.find('input[name="path-downloaded"]').val(`${downloadDirectory}/${courseName}`);
    $course.find(".open-dir.button").show();

    $pauseButton.click(function () {
        stopDownload();
    });

    $resumeButton.click(function () {
        downloader._downloads[downloader._downloads.length - 1].resume();
        $resumeButton.addClass("disabled");
        $pauseButton.removeClass("disabled");
    });

    let downloaded = 0;
    let toDownload = courseData["totalLectures"];

    const enableDownloadStartEnd = Settings.download.enableDownloadStartEnd;
    if (enableDownloadStartEnd) {
        let downloadStart = Settings.download.downloadStart;
        let downloadEnd = Settings.download.downloadEnd;

        if (downloadStart > downloadEnd) {
            downloadStart = downloadEnd;
        }

        if (downloadStart < 1) {
            downloadStart = 1;
        } else if (downloadStart > toDownload) {
            downloadStart = toDownload;
        }

        if (downloadEnd < 1 || downloadEnd > toDownload) {
            downloadEnd = toDownload;
        }

        toDownload = downloadEnd - downloadStart + 1;
        downloadChapter(lectureChapterMap[downloadStart].chapterIndex, lectureChapterMap[downloadStart].lectureIndex);
    } else {
        downloadChapter(0, 0);
    }

    $progressCombined.progress({
        total: toDownload,
        text: {
            active: `${translate("Downloaded")} {value} ${translate("out of")} {total} ${translate("items")}`,
        },
    });

    $progressCombined.progress("reset");
    $downloadSpeed.show();
    $downloadQuality.show();
    $course.find(".info-downloaded").hide();

    function stopDownload(isEncryptedVideo) {
        downloader._downloads[downloader._downloads.length - 1].stop();
        $pauseButton.addClass("disabled");
        $resumeButton.removeClass("disabled");

        if (isEncryptedVideo) {
            resetCourse($course, $course.find(".course-encrypted"));
        }
    }

    function downloadChapter(chapterIndex, lectureIndex) {
        try {
            const countLectures = courseData["chapters"][chapterIndex]["lectures"].length;
            const seqName = utils.getSequenceName(
                chapterIndex + 1,
                courseData["chapters"].length,
                sanitize(courseData["chapters"][chapterIndex]["name"].trim()),
                ". ",
                downloadDirectory + "/" + courseName
            );

            fs.mkdirSync(seqName.fullPath, { recursive: true });
            downloadLecture(chapterIndex, lectureIndex, countLectures, seqName.name);
        } catch (err) {
            appendLog("downloadChapter_Error:", err.message);
            //captureException(err);
            dialog.showErrorBox("downloadChapter_Error", err.message);

            resetCourse($course, $course.find(".download-error"), false, courseData);
        }
    }

    function downloadLecture(chapterIndex, lectureIndex, countLectures, chapterName) {
        try {
            if (downloaded == toDownload) {
                resetCourse($course, $course.find(".download-success"));
                sendNotification(
                    downloadDirectory + "/" + courseName,
                    courseName,
                    $course.find(".ui.tiny.image").find(".course-image").attr("src")
                );
                return;
            } else if (lectureIndex == countLectures) {
                downloadChapter(++chapterIndex, 0);
                return;
            }

            const lectureType = courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["type"].toLowerCase();
            const lectureName = courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["name"].trim();
            const sanitizedLectureName = sanitize(lectureName);

            function dlStart(dl, typeVideo, callback) {
                // Change retry options to something more forgiving and threads to keep udemy from getting upset
                dl.setRetryOptions({
                    maxRetries: 3, // Default: 5
                    retryInterval: 3000, // Default: 2000
                });

                // Set download options
                dl.setOptions({
                    threadsCount: 5, // Default: 2, Set the total number of download threads
                    timeout: 5000, // Default: 5000, If no data is received, the download times out (milliseconds)
                    range: "0-100", // Default: 0-100, Control the part of file that needs to be downloaded.
                });

                dl.start();
                // To track time and restarts
                let notStarted = 0;
                let reStarted = 0;

                timer = setInterval(function () {
                    // Status:
                    //   -3 = destroyed
                    //   -2 = stopped
                    //   -1 = error
                    //   0 = not started
                    //   1 = started (downloading)
                    //   2 = error, retrying
                    //   3 = finished
                    switch (dl.status) {
                        case 0:
                            // Wait a reasonable amount of time for the download to start and if it doesn't then start another one.
                            // once one of them starts the errors from the others will be ignored and we still get the file.
                            if (reStarted <= 5) {
                                notStarted++;
                                if (notStarted >= 15) {
                                    dl.start();
                                    notStarted = 0;
                                    reStarted++;
                                }
                            }
                            $downloadSpeedValue.html(0);
                            break;

                        case 1:
                        case -1:
                            const stats = dl.getStats();
                            const speedAndUnit = utils.getDownloadSpeed(stats.present.speed || 0);
                            $downloadSpeedValue.html(speedAndUnit.value);
                            $downloadSpeedUnit.html(speedAndUnit.unit);
                            console.log(`dl~stats.present.speed: ${stats.present.speed}`);
                            console.log(`Download speed: ${speedAndUnit.value}${speedAndUnit.unit}`);
                            $progressIndividual.progress("set percent", stats.total.completed);

                            if (dl.status === -1 && dl.stats.total.size == 0 && fs.existsSync(dl.filePath)) {
                                dl.emit("end");
                                clearInterval(timer);
                            } else if (dl.status === -1) {
                                axios({
                                    timeout: ajaxTimeout,
                                    type: "HEAD",
                                    url: dl.url,
                                }).then(() => {
                                    resetCourse(
                                        $course,
                                        $course.find(".download-error"),
                                        Settings.download.autoRetry,
                                        courseData,
                                        subtitle
                                    );
                                }).catch((error) => {
                                    const statusCode = error.response ? error.response.status : 0;
                                    appendLog(`downloadLecture_Error: ${error.code}(${statusCode})`, error.message);

                                    try {
                                        if (statusCode == 401 || statusCode == 403) {
                                            fs.unlinkSync(dl.filePath);
                                        }
                                    } finally {
                                        resetCourse(
                                            $course,
                                            $course.find(".download-error"),
                                            Settings.download.autoRetry,
                                            courseData,
                                            subtitle
                                        );
                                    }
                                });

                                clearInterval(timer);
                            }
                            break;

                        case 2:
                        case -3:
                            break;
                        default:
                            $downloadSpeedValue.html(0);
                    }
                }, 1000);

                dl.on("error", function (dl) {
                    if (hasDRMProtection(dl)) {
                        dl.emit("end");
                    } else {
                        appendLog("errorDownload", dl.error.message);
                    }
                });

                dl.on("start", function () {
                    let file = dl.filePath.split("/").slice(-2).join("/");

                    console.log("startDownload", file);
                    $pauseButton.removeClass("disabled");
                });

                dl.on("stop", function () {
                    console.warn("stopDownload");
                });

                dl.on("end", function () {
                    // console.log("Download Finalizado", dl);
                    if (typeVideo && hasDRMProtection(dl)) {
                        $course.find('input[name="encryptedvideos"]').val(++courseData.encryptedVideos);

                        appendLog(`DRM Protected::${courseData.name}`, dl.filePath, false);
                        fs.unlink(dl.filePath + ".mtd", (err) => {
                            if (err) {
                                console.error("dl.on(end)__fs.unlink", err.message);
                            }
                        });

                        if (!Settings.download.continueDonwloadingEncrypted) {
                            dl.destroy();
                            stopDownload(true);
                            clearInterval(timer);
                            return;
                        }
                    }
                    callback();
                });
            }

            function downloadAttachments(index, total_assets) {
                $progressIndividual.progress("reset");

                const attachment = courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["supplementary_assets"][index];
                const attachmentName = attachment["name"].trim();

                var lectureQuality = attachment["quality"];
                var lastClass = $downloadQuality.attr("class").split(" ").pop();

                $downloadQuality
                    .html(lectureQuality)
                    .removeClass(lastClass)
                    .addClass(labelColorMap[lectureQuality] || "grey");

                if (attachment["type"] == "Article" || attachment["type"] == "Url") {
                    const wfDir = downloadDirectory + "/" + courseName + "/" + chapterName;
                    fs.writeFile(
                        utils.getSequenceName(lectureIndex + 1, countLectures, attachmentName + ".html", `.${index + 1} `, wfDir).fullPath,
                        attachment["src"],
                        function () {
                            index++;
                            if (index == total_assets) {
                                $progressCombined.progress("increment");
                                downloaded++;
                                downloadLecture(chapterIndex, ++lectureIndex, countLectures, chapterName);
                            } else {
                                downloadAttachments(index, total_assets);
                            }
                        }
                    );
                } else {
                    //Download anexos
                    let fileExtension = attachment.src.split("/").pop().split("?").shift().split(".").pop();
                    fileExtension = attachment.name.split(".").pop() == fileExtension ? "" : "." + fileExtension;

                    const seqName = utils.getSequenceName(
                        lectureIndex + 1,
                        countLectures,
                        sanitize(attachmentName) + fileExtension,
                        `.${index + 1} `,
                        `${downloadDirectory}/${courseName}/${chapterName}`
                    );

                    if (fs.existsSync(seqName.fullPath + ".mtd") && !fs.statSync(seqName.fullPath + ".mtd").size) {
                        fs.unlinkSync(seqName.fullPath + ".mtd");
                    }

                    if (fs.existsSync(seqName.fullPath + ".mtd")) {
                        console.log("downloadAttachments: Reiniciando download", seqName.fullPath);
                        var dl = downloader.resumeDownload(seqName.fullPath);
                    } else if (fs.existsSync(seqName.fullPath)) {
                        endDownload();
                        return;
                    } else {
                        if (seqName.fullPath.includes(".mp4") || attachment["type"].toLowerCase() == "video")
                            console.log("downloadAttachements: Iniciando download do Video", attachment["src"]);

                        var dl = downloader.download(attachment["src"], seqName.fullPath);
                    }

                    dlStart(dl, attachment["type"].toLowerCase() == "video", endDownload);

                    function endDownload() {
                        index++;

                        clearInterval(timer);
                        if (index == total_assets) {
                            $progressCombined.progress("increment");
                            downloaded++;
                            downloadLecture(chapterIndex, ++lectureIndex, countLectures, chapterName);
                        } else {
                            downloadAttachments(index, total_assets);
                        }
                    }
                }
            }

            function checkAttachment() {
                $progressIndividual.progress("reset");
                const attachment = courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["supplementary_assets"];

                if (attachment) {
                    // order by name
                    courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["supplementary_assets"].sort(utils.dynamicSort("name"));

                    var total_assets = attachment.length;
                    var index = 0;
                    downloadAttachments(index, total_assets);
                } else {
                    $progressCombined.progress("increment");
                    downloaded++;
                    downloadLecture(chapterIndex, ++lectureIndex, countLectures, chapterName);
                }
            }

            function downloadSubtitle() {
                $progressIndividual.progress("reset");
                var lastClass = $downloadQuality.attr("class").split(" ").pop();
                $downloadQuality
                    .html("Subtitle")
                    .removeClass(lastClass)
                    .addClass(labelColorMap["Subtitle"] || "grey");
                $downloadSpeedValue.html(0);

                const seqName = utils.getSequenceName(
                    lectureIndex + 1,
                    countLectures,
                    sanitizedLectureName + ".srt",
                    ". ",
                    `${downloadDirectory}/${courseName}/${chapterName}`
                );

                if (fs.existsSync(seqName.fullPath)) {
                    checkAttachment();
                    return;
                }
                const vttFile = seqName.fullPath.replace(".srt", ".vtt");

                var file = fs.createWriteStream(vttFile).on("finish", function () {
                    var finalSrt = fs.createWriteStream(seqName.fullPath).on("finish", function () {
                        fs.unlinkSync(vttFile);
                        checkAttachment();
                    });

                    fs.createReadStream(vttFile).pipe(vtt2srt()).pipe(finalSrt);
                });

                var caption = courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["caption"];
                var available = [];
                $.map(subtitle, function (el) {
                    if (el in caption) {
                        available.push(el);
                    }
                });

                var download_this_sub = available[0] || Object.keys(caption)[0] || "";
                // Prefer non "[Auto]" subs (likely entered by the creator of the lecture.)
                if (available.length > 1) {
                    for (let key in available) {
                        if (available[key].indexOf("[Auto]") == -1 || available[key].indexOf(`[${translate("Auto")}]`) == -1) {
                            download_this_sub = available[key];
                            break;
                        }
                    }
                }

                https.get(
                    caption[download_this_sub],
                    function (response) {
                        response.pipe(file);
                    }
                );
            }

            // read url as string or ArrayBuffer
            async function getFile(url, binary) {
                console.log("getFile: ", { url, binary });
                var count = 0;

                // on error retry 3 times
                while (count < 3) {
                    try {
                        var i = await fetch(url);

                        var t = i.status;

                        if (t >= 200 && t < 300) {
                            if (binary) return await i.arrayBuffer();

                            return await i.text();
                        } else console.log("getFile_Buffer", i.statusText);
                    } catch (err) {
                        appendLog("getFile_Error", err.message);
                    }

                    count++;
                }

                return null;
            }

            // read highest quality playlist
            async function getPlaylist(url) {
                console.log("getPlaylist~getFile(text): ", url);
                var playlist = await getFile(url, false);

                if (!playlist) return [];

                var lines = playlist.trim().split("\n");
                var urlList = [];

                lines.forEach((line) => {
                    if (line.toLowerCase().indexOf(".ts") > -1) urlList.push(line);
                });

                if (urlList.length == 0 && playlist.indexOf("m3u8") > 0) {
                    var maximumQuality = 0;
                    var maximumQualityPlaylistUrl;
                    var getUrl = false;

                    for (var line of lines) {
                        if (getUrl) {
                            maximumQualityPlaylistUrl = line;
                            getUrl = false;
                        }

                        line = line.toUpperCase();

                        if (line.indexOf("EXT-X-STREAM-INF") > -1 && line.indexOf("RESOLUTION") > -1) {
                            try {
                                var readQuality = parseInt(line.split("RESOLUTION=")[1].split("X")[1].split(",")[0]) || 0;

                                if (readQuality > maximumQuality) {
                                    maximumQuality = readQuality;
                                    getUrl = true;
                                }
                            } catch (err) {
                                appendLog("getPlaylist_Error", err.message);
                                captureException(err);
                            }
                        }
                    }

                    if (maximumQuality > 0) {
                        $downloadQuality.html(`${lectureQuality} ${maximumQuality}p`);

                        console.log("getPlaylist maximumQuality: ", maximumQualityPlaylistUrl);
                        return await getPlaylist(maximumQualityPlaylistUrl);
                    }
                }

                return urlList;
            }

            $progressIndividual.progress("reset");

            var lectureQuality = courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["quality"];
            var lastClass = $downloadQuality.attr("class").split(" ").pop();

            $downloadQuality
                .html(lectureQuality + (lectureType == "video" && !isNaN(parseFloat(lectureQuality)) ? "p" : ""))
                .removeClass(lastClass)
                .addClass(labelColorMap[lectureQuality] || "grey");

            if (lectureType == "article" || lectureType == "url") {
                const wfDir = `${downloadDirectory}/${courseName}/${chapterName}`;
                fs.writeFile(
                    utils.getSequenceName(lectureIndex + 1, countLectures, sanitizedLectureName + ".html", ". ", wfDir).fullPath,
                    courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["src"],
                    function () {
                        if (courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["supplementary_assets"]) {
                            courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["supplementary_assets"].sort(
                                utils.dynamicSort("name")
                            );
                            var total_assets =
                                courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["supplementary_assets"].length;
                            var index = 0;
                            downloadAttachments(index, total_assets);
                        } else {
                            $progressCombined.progress("increment");
                            downloaded++;
                            downloadLecture(chapterIndex, ++lectureIndex, countLectures, chapterName);
                        }
                    }
                );
            } else {
                const seqName = utils.getSequenceName(
                    lectureIndex + 1,
                    countLectures,
                    sanitizedLectureName + (lectureType == "file" ? ".pdf" : ".mp4"),
                    ". ",
                    `${downloadDirectory}/${courseName}/${chapterName}`
                );

                // $lecture_name.html(`${courseData["chapters"][chapterIndex].name}\\${courseData["chapters"][chapterIndex]["lectures"][lectureIndex].name}`);
                const skipLecture = Number(Settings.download.type) === Settings.DownloadType.OnlyAttachments;

                // if not stream
                if (lectureQuality != "Highest") {
                    if (fs.existsSync(seqName.fullPath + ".mtd") && !fs.statSync(seqName.fullPath + ".mtd").size) {
                        fs.unlinkSync(seqName.fullPath + ".mtd");
                    }

                    if (fs.existsSync(seqName.fullPath + ".mtd") && !skipLecture) {
                        console.log("downloadLecture: Reiniciando download", seqName.fullPath);
                        var dl = downloader.resumeDownload(seqName.fullPath);
                    } else if (fs.existsSync(seqName.fullPath) || skipLecture) {
                        endDownloadAttachment();
                        return;
                    } else {
                        console.log(
                            "downloadLecture: Iniciando download do Video ",
                            courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["src"]
                        );
                        var dl = downloader.download(
                            courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["src"],
                            seqName.fullPath
                        );
                    }

                    dlStart(dl, lectureType == "video", endDownloadAttachment);
                } else {
                    if (fs.existsSync(seqName.fullPath + ".mtd")) {
                        fs.unlinkSync(seqName.fullPath + ".mtd");
                    } else if (fs.existsSync(seqName.fullPath) || skipLecture) {
                        endDownloadAttachment();
                        return;
                    }

                    getPlaylist(courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["src"]).then(async (list) => {
                        console.log("getPlaylist~getFile(binary): ", courseData["chapters"][chapterIndex]["lectures"][lectureIndex]["src"]);
                        if (list.length > 0) {
                            var result = [list.length];

                            var count = 0;
                            $progressIndividual.progress("reset");

                            for (var a of list) {
                                var startTime = performance.now();
                                var response = await getFile(a, true);
                                var endTime = performance.now();
                                var timeDiff = (endTime - startTime) / 1000.0;
                                var chunkSize = Math.floor(response.byteLength / 1024) || 1;

                                var download_speed_and_unit = utils.getDownloadSpeed(chunkSize / timeDiff);
                                $downloadSpeedValue.html(download_speed_and_unit.value);
                                $downloadSpeedUnit.html(download_speed_and_unit.unit);
                                result[count] = response;
                                count++;
                                $progressIndividual.progress("set percent", parseInt((count / list.length) * 100));
                            }

                            var blob = new Blob(result, {
                                type: "application/octet-binary",
                            });
                            var data = Buffer.from(await blob.arrayBuffer());
                            fs.writeFileSync(seqName.fullPath, data);
                            // fs.renameSync(seqName.fullPath + ".mtd", seqName.fullPath);
                        }

                        endDownloadAttachment();
                        return;
                    });
                }

                function endDownloadAttachment() {
                    clearInterval(timer);
                    if (courseData["chapters"][chapterIndex]["lectures"][lectureIndex].caption) {
                        downloadSubtitle();
                    } else {
                        checkAttachment();
                    }
                }
            }
        } catch (err) {
            appendLog("downloadLecture_Error:", err.message);
            captureException(err);

            resetCourse($course, $course.find(".download-error"), false, courseData);
        }
    }

    function hasDRMProtection(dl) {
        try {
            // return !dl.meta.headers["content-type"].includes("video");
            const encrypted = dl.url.includes("encrypted-files");
            if (encrypted) console.warn("Arquivo encriptado", dl);

            return encrypted;
        } catch (error) {
            return false;
        }
    }
}

function askForSubtitle(availableSubs, initDownload, $course, courseData, defaultSubtitle = "") {
    var $subtitleModal = $(".ui.subtitle.modal");
    var $subtitleDropdown = $subtitleModal.find(".ui.dropdown");
    var subtitleLanguages = [];
    var languages = [];
    var totals = [];
    var languageKeys = {};

    defaultSubtitle = defaultSubtitle
        .replace("[Auto]", "")
        .replace(`[${translate("Auto")}]`, "")
        .trim();

    for (var key in availableSubs) {
        const subtitle = key
            .replace("[Auto]", "")
            .replace(`[${translate("Auto")}]`, "")
            .trim();

        // default subtitle exists
        if (subtitle === defaultSubtitle) {
            initDownload($course, courseData, key);
            return;
        }

        if (!(subtitle in totals)) {
            languages.push(subtitle);
            totals[subtitle] = 0;
            languageKeys[subtitle] = [];
        }

        totals[subtitle] += availableSubs[key];
        languageKeys[subtitle].push(key);
    }

    // only a subtitle
    if (languages.length == 1) {
        initDownload($course, courseData, languageKeys[0]);
        return;
    } else if (languages.length == 0) {
        return;
    }

    for (var total in totals) {
        totals[total] = Math.min(courseData["totalLectures"], totals[total]);
    }

    languages.sort();
    for (var language of languages) {
        subtitleLanguages.push({
            name: `<b>${language}</b> <i>${totals[language]} ${translate("Lectures")}</i>`,
            value: languageKeys[language].join("|"),
        });
    }

    $subtitleModal.modal({ closable: false }).modal("show");

    $subtitleDropdown.dropdown({
        values: subtitleLanguages,
        onChange: function (subtitle) {
            $subtitleModal.modal("hide");
            $subtitleDropdown.dropdown({ values: [] });
            initDownload($course, courseData, subtitle);
        },
    });
}

function resetCourse($course, $elMessage, autoRetry, courseData, subtitle) {
    if ($elMessage.hasClass("download-success")) {
        $course.attr("course-completed", true);
    } else {
        $course.attr("course-completed", "");

        if ($elMessage.hasClass("download-error")) {
            if (autoRetry && courseData.errorCount++ < 5) {
                $course.length = 1;
                initDownload($course, courseData, subtitle);
                return;
            }
        }
    }

    $course.find(".download-quality").hide();
    $course.find(".download-speed").hide().find(".value").html(0);
    $course.find(".download-status").hide().html(ui.actionCardTemplate);
    $course.css("padding", "14px 0px");
    $elMessage.css("display", "flex");
}

function rendererCourse(response, keyword = "") {
    console.log("rendererCourse", response);

    //activateBusy(false);
    $(".ui.dashboard .ui.courses.section .disposable").remove();
    $(".ui.dashboard .ui.courses.section .ui.courses.items").empty();
    if (response.results.length) {
        $.each(response.results, function (index, course) {
            $(".ui.dashboard .ui.courses.section .ui.courses.items").append(htmlCourseCard(course));
        });
        if (response.next) {
            $(".ui.courses.section").append(
                `<button class="ui basic blue fluid load-more button disposable" data-url=${response.next}>
          ${translate("Load More")}
        </button>`
            );
        }
    } else {
        let msg = "";
        if (keyword.length === 0) {
            msg = getMsgChangeSearchMode();
            appendLog(translate("No Courses Found"), msg, false);
        }

        $(".ui.dashboard .ui.courses.section .ui.courses.items").append(
            `<div class="ui yellow message disposable">
        ${translate("No Courses Found")} <br/>
        ${translate("Remember, you will only be able to see the courses you are enrolled in")}
        ${msg}
      </div>`
        );
    }
}

function rendererDownloads() {
    console.log("rendererDownloads");

    const courseItems = $(".ui.downloads.section .ui.courses.items .ui.course.item");
    if (courseItems.length) {
        return;
    }

    const downloadedCourses = Settings.downloadedCourses;
    if (downloadedCourses) {
        downloadedCourses.forEach(function (course) {
            const $courseCard = htmlCourseCard(course, true);
            $(".ui.downloads.section .ui.courses.items").append($courseCard);

            if (!course.completed && Settings.download.autoStartDownload) {
                downloadButtonClick($courseCard, course.selectedSubtitle);
                $courseCard.find(".action.buttons").find(".pause.button").removeClass("disabled");
            }
        });
    }
}

function loadMore($loadMoreButton) {
    const $courses = $loadMoreButton.prev(".courses.items");
    const url = $loadMoreButton.data("url");

    ui.dimmerLoadCourses(true);
    axios({
        timeout: ajaxTimeout,
        method: "GET",
        url,
        headers: headersAuth,
    }).then(({ data: resp }) => {
        // $.each(resp.results, (_index, course) => {
        //     htmlCourseCard(course).appendTo($courses);
        // });
        $courses.append(...resp.results.map(htmlCourseCard));
        if (!resp.next) {
            $loadMoreButton.remove();
        } else {
            $loadMoreButton.data("url", resp.next);
        }
    }).catch(error => {
        const statusCode = error.response?.status || error?.code || 0;
        appendLog(`loadMore_Error: ${error.code}(${statusCode})`, error.message);
    }).finally(() => {
        ui.dimmerLoadCourses(false);
    });
}

function search(keyword) {
    const subscriber = Settings.subscriber;
    const url = !subscriber
        ? `https://${Settings.subDomain}.udemy.com/api-2.0/users/me/subscribed-courses?page=1&page_size=30&ordering=title&fields[user]=job_title&page_size=${pageSize}&search=${keyword}`
        : `https://${Settings.subDomain}.udemy.com/api-2.0/users/me/subscription-course-enrollments?page=1&page_size=30&ordering=title&fields[user]=job_title&page_size=${pageSize}&search=${keyword}`;

    console.log("search", url);

    ui.dimmerLoadCourses(true);
    axios({
        timeout: ajaxTimeout, // timeout to 5 seconds
        type: "GET",
        url,
        headers: headersAuth,
    }).then((response) => {
        console.log("search done");
        rendererCourse(response.data, keyword);
    }).catch((error) => {
        const statusCode = error.response ? error.response.status : 0;
        appendLog(`search_Error: ${error.code}(${statusCode})`, error.message);
    }).finally(() => {
        ui.dimmerLoadCourses(false);
    });
}

/**
 * Returns a message for changing search mode based on account subscription status
 *
 * @return {string} Message for changing search mode
 */
function getMsgChangeSearchMode() {
    let message = "<p>";

    message += Settings.subscriber
        ? translate("This account has been identified with a subscription plan")
        : translate("This account was identified without a subscription plan");

    message += `<br/>${translate("If it's wrong, change the search mode and try again")}`;
    message += `<div class="ui fluid buttons"><button class='ui primary button change-search-mode' onclick='toggleSubscriber()'>${translate(
        "Change search mode"
    )}</button></div>`;
    message += "</p>";

    return message;
}

/**
 * Toggles the subscriber setting and clears the search field.
 */
function toggleSubscriber() {
    Settings.subscriber = !Settings.subscriber;
    search("");
}

function addDownloadHistory(courseId, completed = false, encryptedVideos = 0, selectedSubtitle = "", pathDownloaded = "") {
    var item = undefined;
    const items = getAllDownloadsHistory() ?? [];

    completed = Boolean(completed);

    if (items.length > 0) {
        item = items.find((x) => x.id == courseId);
    }

    if (item) {
        if (completed !== item.completed) {
            item.completed = completed;
            item.date = new Date(Date.now()).toLocaleDateString();
        }
        item.encryptedVideos = encryptedVideos;
        item.selectedSubtitle = selectedSubtitle;
        item.pathDownloaded = pathDownloaded;
    } else {
        item = {
            id: courseId,
            completed,
            date: new Date(Date.now()).toLocaleDateString(),
            encryptedVideos,
            selectedSubtitle,
            pathDownloaded,
        };

        items.push(item);
    }

    Settings.downloadHistory = items;
}

function getAllDownloadsHistory() {
    return Settings.downloadHistory;
}

function getDownloadHistory(courseId) {
    try {
        const items = getAllDownloadsHistory() ?? [];

        if (items.length > 0) {
            return items.find((x) => x.id == courseId);
        }

        return undefined;
    } catch (error) {
        return undefined;
    }
}

function saveDownloads(quit) {
    var downloadedCourses = [];
    var $downloads = $(".ui.downloads.section .ui.courses.items .ui.course.item").slice(0);

    if ($downloads.length) {
        $downloads.each(function (index, elem) {
            const $elem = $(elem);
            const inProgress = $elem.find(".progress.active").length;
            const individualProgress = inProgress ? $elem.find(".download-status .individual.progress").attr("data-percent") : 0;
            const combinedProgress = inProgress ? $elem.find(".download-status .combined.progress").attr("data-percent") : 0;
            const completed = inProgress ? false : Boolean($elem.attr("course-completed"));

            var course = {
                id: $elem.attr("course-id"),
                url: $elem.attr("course-url"),
                title: $elem.find(".coursename").text(),
                image: $elem.find(".image img").attr("src"),
                individualProgress: individualProgress > 100 ? 100 : individualProgress,
                combinedProgress: combinedProgress > 100 ? 100 : combinedProgress,
                completed,
                progressStatus: $elem.find(".download-status .label").text(),
                encryptedVideos: $elem.find('input[name="encryptedvideos"]').val(),
                selectedSubtitle: $elem.find('input[name="selectedSubtitle"]').val(),
                pathDownloaded: $elem.find('input[name="path-downloaded"]').val(),
            };

            downloadedCourses.push(course);
            addDownloadHistory(course.id, completed, course.encryptedVideos, course.selectedSubtitle, course.pathDownloaded);
        });

        Settings.downloadedCourses = downloadedCourses;
    }
    if (quit) {
        ipcRenderer.send("quitApp");
    }
}

function removeCurseDownloads(courseId) {
    var $downloads = $(".ui.downloads.section .ui.courses.items .ui.course.item").slice(0);

    if ($downloads.length) {
        $downloads.each(function (index, elem) {
            $elem = $(elem);
            if ($elem.attr("course-id") == courseId) {
                $elem.remove();
            }
        });
    }
}

function sendNotification(pathCourse, courseName, urlImage = null) {
    var notification = new Notification(courseName, {
        body: translate("Download Finished"),
        icon: urlImage ?? __dirname + "/assets/images/build/icon.png",
    });

    notification.onclick = function () {
        shell.openPath(pathCourse);
    };
}

function clearLogArea() {
    loggers = [];
    $(".ui.logger.section .ui.list").html("");
    clearBagdeLoggers();
}

function appendLog(title, description, isError = true) {
    const incrementBadgeLoggers = () => {
        let qtd = $("#badge-logger").text();
        qtd = qtd.trim().length > 0 ? parseInt(qtd, 0) + 1 : 1;

        $("#badge-logger").text(qtd > 99 ? "99+" : qtd);
        $("#badge-logger").show();
    }

    const log = {
        datetime: new Date().toLocaleString(),
        title,
        description,
    };

    loggers.unshift(log);

    $(".ui.logger.section .ui.list").prepend(
        `<div class="item">
      <div class="header">
        ${title}
      </div>
      <samp>${description}</samp>
    </div>`
    );

    incrementBadgeLoggers();

    if (isError) {
        console.error(`[${title}] ${description}`);
    } else {
        console.warn(`[${title}] ${description}`);
    }
}

function clearBagdeLoggers() {
    $("#badge-logger").text("0");
    $("#badge-logger").hide();
}

function saveLogFile() {
    if (loggers.length == 0) return;

    dialog
        .showSaveDialog({
            title: "Udeler Log",
            defaultPath: "udeler_logger.txt",
            filters: [{ name: "Text File (*.txt)", fileExtension: ["txt"] }],
        }).then((result) => {
            if (!result.canceled) {
                let filePath = result.filePath;
                if (!filePath.endsWith(".txt")) filePath += ".txt";

                let content = "";

                loggers.forEach((item) => {
                    content += `${item.datetime} - ${item.title}: ${item.description}\n`;
                });

                fs.writeFile(filePath, content, (err) => {
                    if (err) {
                        appendLog("saveLogFile_Error", err.message);
                        // captureException(err);
                        return;
                    }
                    console.log("File successfully create!");
                });
            }
        });
}

function showAlert(title, message) {
    if (title) title = `.:: ${title} ::.\n\n\r`;
    prompt.alert(`${title}${message}`);
}

function captureException(exception) {
    if (Sentry) Sentry.captureException(exception);
}

process.on("uncaughtException", (error) => {
    appendLog("uncaughtException", error.stack);
    captureException(error);
});

process.on("unhandledRejection", (error) => {
    appendLog("unhandledRejection", error.stack);
    captureException(error);
});

// console.table(getAllDownloadsHistory());
checkLogin();
