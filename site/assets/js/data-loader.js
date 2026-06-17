(function () {
    const dataUrl = 'assets/data/kk26.json';

    function publishData(data) {
        window.KK26_PROJECTS = data;
        window.KK26_OUTCOMES = data.outcomes || {};
        return data;
    }

    if (window.KK26_PUBLIC_DATA) {
        window.KK26_DATA_READY = Promise.resolve(publishData(window.KK26_PUBLIC_DATA));
        return;
    }

    window.KK26_DATA_READY = fetch(dataUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Could not load ${dataUrl}: ${response.status}`);
            }
            return response.json();
        })
        .then(publishData)
        .catch(error => {
            console.error('KK26 public data could not be loaded:', error);
            throw error;
        });
}());
