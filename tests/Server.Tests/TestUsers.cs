using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Tests;

// Creates users straight through Identity, bypassing invites, and HTTP clients
// that act as them (see TestAuth). Every call makes a fresh user with a unique
// email address, so tests sharing the database don't collide.
public static class TestUsers
{
    public const string Password = "test-password";

    public static async Task<AppUser> CreateUserAsync(
        this AppFactory app, string displayName = "Testperson", bool isAdmin = false, bool withPassword = true)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var email = $"{Guid.NewGuid():N}@example.test";
        var user = new AppUser
        {
            DisplayName = displayName,
            Email = email,
            UserName = email,
            IsAdmin = isAdmin,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        var result = withPassword ? await users.CreateAsync(user, Password) : await users.CreateAsync(user);
        Assert.True(result.Succeeded, string.Join(", ", result.Errors.Select(e => e.Code)));
        return user;
    }

    public static HttpClient CreateClientFor(this AppFactory app, AppUser user)
    {
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());
        return client;
    }
}
