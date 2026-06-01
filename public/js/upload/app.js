export function uploadApp() {
  return {
    fileName: 'Choose file',
    uploading: false,
    result: null,
    status: {
      message: '',
      type: ''
    },

    updateFileName() {
      const file = this.$refs.fileInput.files[0];
      this.fileName = file ? file.name : 'Choose file';
    },

    async uploadFile() {
      const file = this.$refs.fileInput.files[0];
      if (!file) {
        this.showStatus('Please select a file.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('presentation', file);

      try {
        this.uploading = true;
        this.showStatus('Processing...', 'info');

        const response = await fetch('/upload', {
          method: 'POST',
          body: formData,
          headers: {
            'ngrok-skip-browser-warning': '69420',
            Accept: 'application/json'
          }
        });

        const raw = await response.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          const isNgrokFail =
            response.status === 503 &&
            /ngrok|ERR_NGROK|incomplete HTTP response/i.test(raw);
          const hint = isNgrokFail
            ? 'Ngrok could not get a valid HTTP response (ERR_NGROK_3004). Use: ngrok http http://127.0.0.1:PORT'
            : raw.trimStart().startsWith('<')
              ? 'Upload returned a web page instead of data. Try again or use localhost.'
              : `Invalid response (HTTP ${response.status}).`;
          this.showStatus(hint, 'error');
          console.error('Upload non-JSON response:', response.status, raw.slice(0, 500));
          return;
        }

        if (response.ok) {
          this.status = { message: '', type: '' };
          const base = window.location.origin;
          this.result = {
            url: base + data.url,
            presenterUrl: base + data.presenterUrl
          };
        } else {
          this.showStatus(data.error || 'Upload failed.', 'error');
        }
      } catch (error) {
        this.showStatus('Network error. Please try again.', 'error');
        console.error('Upload error:', error);
      } finally {
        this.uploading = false;
      }
    },

    copy(url) {
      navigator.clipboard.writeText(url).catch(() => {});
    },

    open(url) {
      window.location.href = url;
    },

    showStatus(message, type) {
      this.status = { message, type };
    }
  };
}
