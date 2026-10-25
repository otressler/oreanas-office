using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.Internal;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Tests;

// The invite endpoint without an admin exists for the Playwright tests and local
// development (scripts/dev-user.ps1) only, never in production.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class TestingEndpointsTests
{
    [Theory]
    [InlineData("E2E", true)]
    [InlineData("Development", true)]
    [InlineData("Production", false)]
    [InlineData("Staging", false)]
    public void Invites_without_an_admin_exist_only_for_tests_and_local_development(string environment, bool mapped) =>
        Assert.Equal(mapped, TestingEndpoints.IsMappedIn(new HostingEnvironment { EnvironmentName = environment }));
}
