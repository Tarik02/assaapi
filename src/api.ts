import * as request from 'request-promise-native';
import {JSDOM} from 'jsdom';

export const API_HOST = 'https://assa.intertelecom.ua';
export const API_PATH_LOGIN = '/ua/login';
export const API_PATH_STATISTIC = '/ua/statistic';
export const API_PATH_SPEEDTEST = '/ua/speedtest';
export const API_PATH_SPEEDTEST_FRAME = '/speedtest/index.php?lang=ua';
export const API_PATH_SPEEDTEST_REPORT = 'https://assa.intertelecom.ua/speedtest/speedtest_report.php';

export const API_GETIP_URL = 'https://freegeoip.net/json/?callback=?';
export const API_GETIP_REGEXP = /"ip":"(\d{0,3}\.\d{0,3}\.\d{0,3}\.\d{0,3})"/;

export type LoginData = {user: string, password: string};

export class StatisticData {
	readonly free: number;

	constructor(readonly packets: TrafficPacket[], readonly used: number = 0) {
		this.free = packets.reduce((prev, current) => prev + current.count, 0) - used;
	}
};

export class TrafficPacket {
	constructor(readonly name: string, readonly count: number, readonly expires?: Date) {
	}
}

export default class API {
	protected cookies = request.jar();
	protected loggedIn = false;

	constructor(protected readonly loginData: LoginData) {
	}

	/**
	 * @return залогинен ли текущий API
	 */
	public get isLoggedIn() {
		return this.loggedIn;
	}

	/**
	 * Выполняется попытка входа в систему
	 * @param ref_link Ссылка, на которую будет редирект после успешного логина
	 * @return Текст страницы с результатом входа(обычно {@code ref_link} если логин успешен)
	 */
	public async login(ref_link: string = API_HOST + API_PATH_STATISTIC): Promise<string> {
		const result = <request.FullResponse>await this.request(API_PATH_LOGIN, {
			phone: this.loginData.user,
			pass: this.loginData.password,
			ref_link: ref_link,
			js: 1
		}, {
			resolveWithFullResponse: true
		});
		this.loggedIn = (<any>result.request).href === API_HOST + API_PATH_STATISTIC;
		return result.body;
	}

	/**
	 * @return данные статистики
	 */
	public async statistic(): Promise<StatisticData> {
		const packets: TrafficPacket[] = [];
		const statistic = await this.ensureLogin(API_HOST + API_PATH_STATISTIC);

		const jsdom = new JSDOM(statistic);
		const assas = Array.from(jsdom.window.document.querySelectorAll('table.assa')).map(makeStatisticalMap);
		const used = parseFloat(assas[0][24].value);
		for (const {key, value} of assas[1]) {
			const components = value.split(' по ');
			if (key !== null && components.length === 2) {
				const count = parseFloat(components[0]);
				const expires = new Date(...components[1].split('.').reverse());
				packets.push(new TrafficPacket(key, count, expires));
			}
		}

		return new StatisticData(packets, used);
		
		function makeStatisticalMap(table: HTMLTableElement, sliceCount: number = 0): {key: string, value: string}[] {
			return Array.from(table.children).map((tbody: HTMLTableSectionElement) => 
				Array.from(tbody.rows).slice(sliceCount).map(tr => {
					const components = Array.from(tr.cells).map(cell => ((cell.children.length === 1 ? cell.children[0].textContent :  cell.textContent) || '').trim());
					return {
						key: components[0],
						value: components[1],
					}
				}))[0];
		}
	}

	/**
	 * @return публичный IP текущего компьютера
	 */
	public async ip(): Promise<string> {
		const result = await this.request(API_GETIP_URL, void 0, {
			method: 'get'
		});
		const match = result && result.match(API_GETIP_REGEXP);
		if (!match || !match[1]) {
			throw new Error('Failed to get ip');
		}
		return match[1];
	}

	/**
	 * @return был ли сделан тест скорости
	 */
	public async isSpeedtestDid(): Promise<boolean> {
		await this.ensureLogin();
		await this.request(API_PATH_SPEEDTEST, void 0, {method: 'GET'});

		const speedtestPage = await this.request(API_PATH_SPEEDTEST_FRAME, void 0, {method: 'GET'});
		const jsdom = new JSDOM(speedtestPage);
		const beforeTest = <HTMLDivElement>jsdom.window.document.querySelector('#before-test');
		if ((beforeTest.textContent || '').trim().startsWith('Дякуємо вам')) {
			// Speedtest is already done
			return true;
		}

		return false;
	}

	/**
	 * @return {@code true} если тест сделан успешно, {@code false} если тест уже был сделан
	 * @throws если тест провалился
	 */
	public async reportSpeedtest(): Promise<boolean> {
		if (await this.isSpeedtestDid()) {
			return false;
		}

		const ip = await this.ip();

		await this.request(API_PATH_SPEEDTEST_REPORT, {
			methodid: 1,
			hash: 'bb3ff9566d004a9437dc69ab09289bf0',
			serverport: 443,
			download: (95 + Math.random() * 200) | 0,
			serverurl: 'https://assa.intertelecom.ua/speedtest/speedtest/upload.php',
			clientip: ip,
			testurl: 'https://assa.intertelecom.ua/speedtest/netgauge.swf?v=3.0&lang=ua',
			serverid: 1,
			upload: (95 + Math.random() * 200) | 0,
			latency: (95 + Math.random() * 200) | 0,
			customer: 'intertel',
			testmethod: 'http'
		});

		return true;
	}

	protected async ensureLogin(ref_link: string | null = null) {
		if (!this.loggedIn) {
			const result = await this.login(ref_link || (API_HOST + API_PATH_STATISTIC));
			if (!this.loggedIn) {
				throw new Error('Failed to login');
			}
			return result;
		}
		return ref_link === null ? null : await this.request(ref_link);
	}

	protected async request(path: string, form: object = {}, options: request.RequestPromiseOptions = {}) {
		options = Object.assign(<request.RequestPromiseOptions>{
			method: 'POST',
			followAllRedirects: true,
			jar: this.cookies,
			form: form,
			headers: {
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.109 Safari/537.36'
			}
		}, options);
		return await request({
			uri: path.startsWith('http') ? path : API_HOST + path,
			...options
		});
	}
}