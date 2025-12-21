document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('go-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            history.back();
        });
    }
});
