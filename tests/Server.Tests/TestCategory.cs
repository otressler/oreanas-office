namespace OreanasOffice.Server.Tests;

// Traits for the test tiers of scripts/test.ps1. Unit: pure code, no Docker; mark new
// classes that don't take AppFixture with it. Slow: waits on real time (retries,
// timeouts) and runs only in the full suite.
public static class TestCategory
{
    public const string Name = "Category";
    public const string Unit = "Unit";
    public const string Slow = "Slow";
}
