const gulp = require('gulp');
const path = require('path');
const del = require('del');
const ts = require('gulp-typescript');
const mocha = require('gulp-spawn-mocha');
const sourcemaps = require('gulp-sourcemaps');
const runSequence = require('run-sequence');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const merge = require('merge2');
const Builder = require('systemjs-builder')
const liveServer = require('gulp-live-server');
const argv = require('yargs').argv;

const seq = (...tasks) => done => runSequence(...tasks, done);

function swallowError(e) {
	console.log(e.message);
	this.emit('end');
}

gulp.task('clean', () => {
	return del([
		'dist/*',
	]);
});

const project = ts.createProject('tsconfig.json');
const scripts = ['src/**/*.ts'];

gulp.task('build', () => {
	const result = gulp.src(scripts)
		.pipe(sourcemaps.init())
		.pipe(project(ts.reporter.defaultReporter()));

	return merge([
		result.dts
			.pipe(gulp.dest('dist')),
		result.js
			.pipe(sourcemaps.write({ sourceRoot: path.resolve('src') }))
			.pipe(gulp.dest('dist')),
	]);
});

gulp.task('demo', () => {
	const builder = new Builder('', 'src/demo/config.js');
	return builder.buildStatic('dist/demo/demoClient.js', 'dist/demo/demo.js');
});

gulp.task('tests', () => {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
			exit: true,
			timeout: 5000,
		}))
		.on('error', swallowError);
});

gulp.task('coverage', () => {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
			exit: true,
			istanbul: { print: 'none' },
		}));
});

gulp.task('remap', () => {
	return gulp.src('coverage/coverage.json')
		.pipe(remapIstanbul({ reports: { html: 'coverage-remapped' } }));
});

gulp.task('server', () => {
	const server = liveServer(['dist/demo/demoServer.js'], {});
	server.start();

	gulp.watch(['src/demo/**/*.html'], server.notify.bind(server));
	gulp.watch(['dist/**/*.js'], () => {
		server.start();
	});
});

gulp.task('watch', () => {
	gulp.watch(scripts, ['build-task']);
});

const buildTasks = [
	'build',
	argv.demo ? 'demo' : '',
	argv.coverage ? 'coverage' : 'tests',
	argv.coverage ? 'remap' : ''
].filter(x => x);

gulp.task('empty', () => { });
gulp.task('build-task', seq(...buildTasks));
gulp.task('dev', seq('clean', ...buildTasks, argv.demo ? 'server' : 'empty', 'watch'));
gulp.task('cov', seq('build', 'coverage', 'remap'));
gulp.task('test', seq('build', 'tests'));
