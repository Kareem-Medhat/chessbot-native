pack: dist/build dist/icons dist/manifest.json
	chromium --pack-extension=./dist

dist/build:
	npm run build

dist/icons:
	cp -r ./icons dist/icons

dist/manifest.json:
	cp ./manifest.json dist/manifest.json
