import * as commandLineArgs from 'command-line-args';
import * as dateformat from 'dateformat';
import API from './api';

const argsDefinitions: commandLineArgs.OptionDefinition[] = [
	{name: 'user', alias: 'u', type: String, },
	{name: 'password', alias: 'p', type: String},

	{name: 'help', alias: 'h', type: Boolean},
	{name: 'check-speedtest', alias: 'c', type: Boolean},
	{name: 'speedtest', alias: 't', type: Boolean},
	{name: 'statistic', alias: 's', type: Boolean},
	{name: 'pretty-statistic', alias: 'r', type: Boolean},
];

const options = commandLineArgs(argsDefinitions);

if (!options.user || !options.password) {
	help();
	process.exit(1);
}

(async function() {
	const api = new API({
		user: options.user,
		password: options.password,
	});

	try {
		if (options['help']) {
			help();
		} else if (options['check-speedtest']) {
			console.log((await api.isSpeedtestDid()) ? 'true' : 'false');
		} else if (options['speedtest']) {
			console.log((await api.reportSpeedtest()) ? 'success' : 'skipped');
		} else if (options['statistic']) {
			const stats = await api.statistic();
			console.log(JSON.stringify(stats));
		} else if (options['pretty-statistic']) {
			const stats = await api.statistic();
			console.log(`Осталось трафика: ${stats.free}МБ`);
			console.log(`Использовано трафика в текущей сессии: ${stats.used}МБ`);
			console.log(`Пакеты трафика:`);
			for (const packet of stats.packets) {
				console.log(`\t${packet.count}МБ${packet.expires ? ' по ' + dateformat(packet.expires, 'yyyy-mm-dd') : ''} (${packet.name})`);
			}
		} else {
			help();
			process.exit(1);
		}
	} catch (e) {
		console.log(e);
		process.exit(1);
	}
})();

function help() {
	console.log(`Использование: assa [--user <номер телефона> --password <пароль>] <действие>
Действия:
	--help, -h				Помощь
	--check-speedtest, -c	Проверить, сделан ли тест скорости
	--speedtest, -t			Симулировать тест скорости
	--statistic, -s			Показать статистику (в JSON)
	--pretty-statistic, -r	Показать статистику в читаемом формате`);
}
