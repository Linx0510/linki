(function () {
    const canvas = document.getElementById('activityChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const dataEl = document.getElementById('dailyStatsData');
    const stats = dataEl ? JSON.parse(dataEl.textContent || '[]') : [];
    if (!stats.length) return;

    const labels = stats.map((row) => {
        const date = new Date(row.date);
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    });

    new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Новые пользователи',
                    data: stats.map((row) => Number(row.new_users) || 0),
                    borderColor: '#663ACD',
                    backgroundColor: 'rgba(102, 58, 205, 0.12)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 5
                },
                {
                    label: 'Активные пользователи',
                    data: stats.map((row) => Number(row.active_users) || 0),
                    borderColor: '#CF4386',
                    backgroundColor: 'rgba(207, 67, 134, 0.08)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 5
                },
                {
                    label: 'Новые задачи',
                    data: stats.map((row, index) => {
                        if (index === 0) return 0;
                        const prev = Number(stats[index - 1].total_orders) || 0;
                        const curr = Number(row.total_orders) || 0;
                        return Math.max(0, curr - prev);
                    }),
                    borderColor: '#7B46F8',
                    backgroundColor: 'transparent',
                    borderDash: [6, 4],
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        padding: 16,
                        font: { family: 'Montserrat', size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: '#292929',
                    titleFont: { family: 'Montserrat' },
                    bodyFont: { family: 'Montserrat' },
                    padding: 12,
                    cornerRadius: 10
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxRotation: 0,
                        font: { family: 'Montserrat', size: 11 },
                        color: '#767676'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.06)' },
                    ticks: {
                        stepSize: 1,
                        font: { family: 'Montserrat', size: 11 },
                        color: '#767676'
                    }
                }
            }
        }
    });
})();
