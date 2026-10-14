namespace OreanasOffice.Server.Images;

// Runs background jobs one at a time (knowledge/implementation-plan.md, stage 7): renders
// the guide, sends one request at most every MinRequestInterval, waits out 429s, stores the
// image, records the cost and tells open editors (ImageEvents). Woken by ImageJobQueue when
// a job is added and once at startup, where Running jobs cut off by a restart go back to
// Queued; it never polls the database (knowledge/decisions/hosting.md). Contract stub;
// lane: job queue.
public sealed class ImageJobWorker : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.CompletedTask;
}

// The worker's doorbell: the generate endpoint rings it after saving a Queued job.
public sealed class ImageJobQueue
{
    private readonly SemaphoreSlim _signal = new(0);

    public void Notify()
    {
        if (_signal.CurrentCount == 0)
        {
            _signal.Release();
        }
    }

    public Task WaitAsync(CancellationToken cancellationToken) => _signal.WaitAsync(cancellationToken);
}
