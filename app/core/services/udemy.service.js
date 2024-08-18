"use strict";

const axios = require('axios');
const NodeCache = require('node-cache');
const M3U8Service = require("./m3u8.service");

class UdemyService {
    #timeout = 40000;
    #headerAuth = null;

    #urlBase;
    #urlLogin;
    #URL_COURSES = "/users/me/subscribed-courses";
    #URL_COURSES_ENROLL = "/users/me/subscription-course-enrollments";
    #ASSETS_FIELDS = "&fields[asset]=asset_type,title,filename,body,captions,media_sources,stream_urls,download_urls,external_url,media_license_token";

    #cache = new NodeCache({ stdTTL: 3600 }); // TTL padrão de 1 hora

    constructor(subDomain = "www", httpTimeout = 40000) {
        subDomain = (subDomain.trim().length === 0 ? "www" : subDomain.trim()).toLowerCase();

        this.#urlBase = `https://${subDomain}.udemy.com`;
        this.#timeout = httpTimeout;
        this.#headerAuth = null;
        this.#urlLogin = `${this.#urlBase}/join/login-popup`;
    }

    /**
     * Creates and returns a new Error object with the specified name and message.
     *
     * @param {string} name - The name of the error.
     * @param {string} [message=""] - The optional error message. Default is an empty string.
     * @returns {Error} The newly created Error object.
     */
    _error(name, message = "") {
        const error = new Error();
        error.name = name;
        error.message = message;
        return error;
    }

    async _prepareStreamSource(el) {
        try {
            if (el._class === "lecture") {
                const assetType = el.asset?.asset_type.toLowerCase();
                if (assetType === "video" || assetType === "videomashup") {
                    const asset = el.asset;
                    const stream_urls = asset.stream_urls?.Video || asset.media_sources;
                    const isEncrypted = Boolean(asset.media_license_token);
                    if (stream_urls) {
                        // console.log(`Preparing streams for asset id: ${asset.id}`);
                        const streams = await this._convertToStreams(stream_urls, isEncrypted, asset.title);

                        delete el.asset.stream_urls;
                        delete el.asset.media_sources;
                        el.asset.streams = streams;
                    }
                }
            }
        } catch (error) {
            throw this._error("EPREPARE_STREAM_SOURCE", error.message);
        }
    }

    async _prepareStreamsSource(items) {
        // console.log("Preparing stream urls...", items);
        try {
            const promises = items.map(el => this._prepareStreamSource(el));
            await Promise.all(promises);
            // console.log("All streams prepared");
        } catch (error) {
            throw this._error("EPREPARE_STREAMS_SOURCE", error.message);
        }
    }

    /**
     * Transforms media sources into a standardized format.
     *
     * @param {Array<Object>} streamUrls - The array of stream URLs.
     * @param {boolean} isEncrypted - Indicates if the media is encrypted.
     * @returns {Promise<{
     *  minQuality: string,
     *  maxQuality: string,
     *  isEncrypted: boolean
     *  sources: { [key: string]: { type: string, url: string } }
     * }>} - The transformed media sources.
     */
    async _convertToStreams(streamUrls, isEncrypted, title = "") {
        try {
            if (!streamUrls) {
                throw this._error("ENO_STREAMS", "No streams found to convert");
            }
            const sources = {};
            let minQuality = Number.MAX_SAFE_INTEGER;
            let maxQuality = Number.MIN_SAFE_INTEGER;

            let streams = !isEncrypted ? streamUrls : streamUrls.filter(v => !(v.file || v.src).includes("/encrypted-files"));
            isEncrypted = isEncrypted ? (streams.length === 0) : isEncrypted;

            streams = streams.length > 0 ? streams : streamUrls;

            const promises = streams.map(async video => {
                const type = video.type;
                if (type !== "application/dash+xml") {

                    const quality = video.label.toLowerCase();
                    const url = video.file || video.src;

                    sources[quality] = { type, url };

                    if (quality !== "auto") {
                        const numericQuality = parseInt(quality, 10);
                        if (!isNaN(numericQuality)) {
                            if (numericQuality < minQuality) {
                                minQuality = numericQuality;
                            }
                            if (numericQuality > maxQuality) {
                                maxQuality = numericQuality;
                            }
                        }
                    } else {
                        // auto
                        if (!isEncrypted) {
                            const m3u8 = new M3U8Service(url);
                            // console.log('Before loading playlist');
                            const playlist = await m3u8.loadPlaylist();
                            // console.log('After loading playlist', playlist);

                            for (const item of playlist) {
                                // console.log(`for of playlist ${title}`, item);
                                const numericQuality = item.quality;

                                if (numericQuality < minQuality) {
                                    minQuality = numericQuality;
                                }
                                if (numericQuality > maxQuality) {
                                    maxQuality = numericQuality;
                                }
                                if (!sources[numericQuality.toString()]) {
                                    sources[numericQuality.toString()] = { type, url: item.url }
                                }
                            }

                            // playlist.forEach(item => {
                            // const numericQuality = item.quality;

                            // if (numericQuality < minQuality) {
                            //     minQuality = numericQuality;
                            // }
                            // if (numericQuality > maxQuality) {
                            //     maxQuality = numericQuality;
                            // }
                            // if (!sources[numericQuality.toString()]) {
                            //     sources[numericQuality.toString()] = { type, url: item.url }
                            // }
                            // });
                        }
                    }
                }
            });

            await Promise.all(promises);
            // console.log(`All stream urls converted for assetName: ${title}`);

            return {
                minQuality: minQuality === Number.MAX_SAFE_INTEGER ? "auto" : minQuality.toString(),
                maxQuality: maxQuality === Number.MIN_SAFE_INTEGER ? "auto" : maxQuality.toString(),
                isEncrypted,
                sources
            };
        } catch (error) {
            throw this._error("ECONVERT_TO_STREAMS", error.message);
        }
    }

    async #fetchUrl(url, method = "GET", httpTimeout = this.#timeout) {
        url = `${this.#urlBase}/api-2.0${url}`;

        // Verifique o cache antes de fazer a requisição
        const cachedData = this.#cache.get(url);
        if (cachedData) {
            // console.log(`Cache hit: ${url}`);
            return cachedData;
        }

        // console.log(`Fetching URL: ${url}`);
        try {
            const response = await axios({
                url,
                method,
                headers: this.#headerAuth,
                timeout: this.#timeout,
            });

            // Armazene o resultado no cache
            this.#cache.set(url, response.data);
            return response.data;
        } catch (e) {
            console.error(`Error fetching URL: ${url}`, e);
            throw e;
        }
    }

    async fetchLoadMore(url, httpTimeout = this.#timeout) {
        // Verifique o cache antes de fazer a requisição
        const cachedData = this.#cache.get(url);
        if (cachedData) {
            // console.log(`Cache hit: ${url}`);
            return cachedData;
        }

        // console.log(`Fetching URL: ${url}`);
        try {
            const response = await axios({
                url,
                method: "GET",
                headers: this.#headerAuth,
                timeout: this.#timeout,
            });

            // Armazene o resultado no cache
            this.#cache.set(url, response.data);
            return response.data;
        } catch (e) {
            console.error(`Error fetching URL: ${url}`, e);
            throw e;
        }
    }

    async fetchProfile(accessToken, httpTimeout = this.#timeout) {
        this.#headerAuth = { Authorization: `Bearer ${accessToken}` };
        // return await this._fetchUrl("https://www.udemy.com/api-2.0/users/me");
        return await this.#fetchUrl("/contexts/me/?header=True");
    }

    async fetchSearchCourses(keyword, pageSize, isSubscriber, httpTimeout = this.#timeout) {
        if (!keyword) {
            return await this.fetchCourses(pageSize, isSubscriber, httpTimeout);
        }

        pageSize = Math.max(pageSize, 10);

        const param = `page=1&ordering=title&fields[user]=job_title&page_size=${pageSize}&search=${keyword}`;
        const url = !isSubscriber
            ? `${this.#URL_COURSES}?${param}`
            : `${this.#URL_COURSES_ENROLL}?${param}`;

        return await this.#fetchUrl(url, "GET", httpTimeout);
    }

    async fetchCourses(pageSize = 30, isSubscriber = false, httpTimeout = this.#timeout) {
        pageSize = Math.max(pageSize, 10);

        const param = `page_size=${pageSize}&ordering=-last_accessed`;
        const url = !isSubscriber
            ? `${this.#URL_COURSES}?${param}`
            : `${this.#URL_COURSES_ENROLL}?${param}`;

        return await this.#fetchUrl(url, "GET", httpTimeout);
    }

    async fetchCourse(courseId, httpTimeout = this.#timeout) {
        const url = `/courses/${courseId}/cached-subscriber-curriculum-items?page_size=10000`;
        return await this.#fetchUrl(url, "GET", httpTimeout);
    }

    /**
     * Fetches the lecture data for a given course and lecture ID.
     *
     * @param {number} courseId - The ID of the course.
     * @param {number} lectureId - The ID of the lecture.
     * @param {boolean} getAttachments - Whether to get supplementary assets. Defaults to false.
     * @return {Promise<any>} - The lecture data.
     */
    async fetchLecture(courseId, lectureId, getAttachments, httpTimeout = this.#timeout) {
        const url = `/users/me/subscribed-courses/${courseId}/lectures/${lectureId}?fields[lecture]=title,asset${getAttachments ? ",supplementary_assets" : ""}`

        const lectureData = await this.#fetchUrl(`${url}${this.#ASSETS_FIELDS}`, "GET", httpTimeout);
        // console.log("fetchLecture", lectureData);
        // await this._prepareStreamSource(lectureData);

        return lectureData;
    }

    async fetchLectureAttachments(lectureId, httpTimeout = this.#timeout) {
        const url = `/lectures/${lectureId}/supplementary-assets`;
        return await this.#fetchUrl(url);
    }

    /**
    * Fetches the course content for a given course ID and content type.
    *
    * @param {number} courseId - The ID of the course.
    * @param {'less' | 'all' | 'lectures' | 'attachments'} [contentType='all'] - The type of content to fetch.
    * @return {Promise<any>} - The course content data.
    */
    async fetchCourseContent(courseId, contentType, httpTimeout = this.#timeout) {
        let url = `/courses/${courseId}/cached-subscriber-curriculum-items?page_size=10000`

        contentType = (contentType || "less").toLowerCase();
        if (contentType !== "less") url += "&fields[lecture]=id,title";
        if (contentType === "all") url += ",asset,supplementary_assets";
        if (contentType === "lectures") url += ",asset";
        if (contentType === "attachments") url += ",supplementary_assets";
        if (contentType !== "less") url += this.#ASSETS_FIELDS;

        const contentData = await this.#fetchUrl(url);
        if (!contentData || contentData.count == 0) {
            return null;
        }

        if (contentData.results[0]._class !== "chapter") {
            contentData.results.unshift({
                id: 0,
                _class: "chapter",
                title: "Chapter 1",
            });
            contentData.count++;
        }

        await this._prepareStreamsSource(contentData.results);

        return contentData;
    }

    get urlBase() {
        return this.#urlBase;
    }
    get urlLogin() {
        return this.#urlLogin;
    }

    get timeout() {
        return this.#timeout;
    }
    set timeout(value) {
        this.#timeout = value;
    }
}

module.exports = UdemyService;
