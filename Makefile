PYTHON ?= python3
PORT ?= 8000

.PHONY: build-site assemble-site-data check-public serve-site deploy deploy-site

build-site:
	$(PYTHON) src/generate_receipts.py
	$(PYTHON) src/assemble_site_data.py
	$(MAKE) check-public

assemble-site-data:
	$(PYTHON) src/assemble_site_data.py

check-public:
	@test -d site
	@test -f site/index.html
	@test -f site/projects.html
	@test -f site/outcomes.html
	@test -f site/info.html
	@test -f site/assets/data/kk26.json
	@test -f site/assets/data/kk26-data.js
	@test ! -e site/js
	@test ! -e site/css
	@test ! -e site/csv
	@if find site \( -name '*.xlsx' -o -name '*.xls' -o -name '.env*' \) -print | grep .; then \
		echo "Unexpected private/workbook file under site/"; \
		exit 1; \
	fi
	@if rg -n "firebase|FIREBASE|OPENAI_API_KEY|raw_data|internal/|kk26_voting/receipts" site; then \
		echo "Unexpected private or obsolete reference under site/"; \
		exit 1; \
	fi

serve-site:
	$(PYTHON) -m http.server $(PORT) --directory site

deploy: check-public
	./deploy_pages.sh

deploy-site: deploy
