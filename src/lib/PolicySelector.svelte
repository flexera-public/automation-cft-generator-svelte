<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { policyStates } from './stores/policyStore';
  import { pushState } from '$app/navigation';

  interface PolicyTemplate {
    id: string;
    name: string;
    description: string;
    version: string;
    providers: {
      name: string
      permissions: PolicyTemplatePermission[]
    }[];
    permissions: PolicyTemplatePermission[];
  }

  interface PolicyTemplatePermission {
    name: string;
    read_only: boolean;
    required: boolean;
  }

  // Active Policy List is indexed by policy name for quick lookup
  let activePolicyList: { [key: string]: PolicyTemplate } = {};

  let policyTemplates: PolicyTemplate[] = [];
  let awsTemplates: PolicyTemplate[] = [];
  const selectedPolicies = writable<{ [key: string]: PolicyTemplate }>({});
  const cloudFormationTemplate = writable('');

  const permissions = writable<string[]>([]);

  const flexeraOrgId = writable('');
  const flexeraZone = writable('app.flexera.com');

  const zoneOptions = [
    'app.flexera.com',
    'app.flexera.eu',
    'app.flexera.au',
  ];

  const TrustedRoleMap = {
    "app.flexera.com": { roleArn: "arn:aws:iam::451234325714:role/production_customer_access" },
    "app.flexera.eu": { roleArn: "arn:aws:iam::451234325714:role/production_eu_customer_access" },
    "app.flexera.au": { roleArn: "arn:aws:iam::451234325714:role/production_apac_customer_access" },
    "app.flexeratest.com": { roleArn: "arn:aws:iam::274571843445:role/staging_customer_access" },
  }

  $: isValidOrgId = /^\d+$/.test($flexeraOrgId);

  $: if (isValidOrgId) {
    updateCloudFormationTemplate($permissions);
  }

  let searchQuery = '';
  let filteredTemplates = awsTemplates;

  // Add filter function
  $: filteredTemplates = awsTemplates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add bulk reset functions
  function resetAllTemplates() {
    filteredTemplates.forEach(template => {
      const select = document.querySelector(`select[data-template="${template.name}"]`) as HTMLSelectElement;
      if (select) {
        select.value = 'disabled';
        togglePolicy(template.name, 'disabled');
        // console.log("Disabling " + template.name);
      }
    });
  }

  // Add bulk update functions
  function updateAllTemplates(mode: 'disabled' | 'readonly' | 'full') {
    filteredTemplates.forEach(template => {
      let m = mode;
      const select = document.querySelector(`select[data-template="${template.name}"]`) as HTMLSelectElement;
      // Check if "Full Access" option exists under the select element
      if (mode === 'full') {
        // If the "Full Access" option does not exist, set mode to "readonly"
        if (!select.querySelector('option[value="full"]')) {
          m = 'readonly';
        };
      }
      if (select) {
        select.value = m;
        togglePolicy(template.name, m);
      }
    });
  }

  onMount(async () => {
    let response = await fetch('https://raw.githubusercontent.com/flexera-public/policy_templates/refs/heads/master/data/policy_permissions_list/master_policy_permissions_list.json');
    let data = await response.text();
    let parsedData = JSON.parse(data);
    policyTemplates.push(...parsedData.values);
    // console.log(policyTemplates[0]);

    response = await fetch('https://raw.githubusercontent.com/flexera-public/policy_templates/refs/heads/master/data/active_policy_list/active_policy_list.json');
    data = await response.text();
    parsedData = JSON.parse(data);
    // For each parsedData.policies, add to activePolicyList
    parsedData.policies.forEach((policy: PolicyTemplate) => {
      activePolicyList[policy.name] = policy;
    });

    // Load AWS policy templates from policyTemplates
    // The providers[] array must contain object with "name" == "aws"
    // Check if providers exists first
    awsTemplates = policyTemplates.filter(
      template => template.providers && template.providers.some(provider => provider.name === 'aws')
    );

    // console.log(JSON.stringify(awsTemplates));
    loadState();
  });

  // Modify togglePolicy to ensure store updates
  function togglePolicy(name: string, mode: 'disabled' | 'readonly' | 'full') {
    const template = awsTemplates.find(t => t.name === name);
    if (!template) return;

    policyStates.update(states => ({
      ...states,
      [name]: {
        mode,
      }
    }));

    updatePermissions(template, mode);
  }

  function updatePermissions(template: PolicyTemplate, mode: string) {
    permissions.update(currentPermissions => {
      // Get all selected policies and their modes from policyStates
      const selectedPolicies = Object.entries($policyStates).filter(([_, state]) =>
        state.mode !== 'disabled'
      );

      // Build permissions list from scratch
      const newPermissions = selectedPolicies.flatMap(([policyName, state]) => {
        const policyTemplate = awsTemplates.find(t => t.name === policyName);
        if (!policyTemplate) return [];

        const aws_provider = policyTemplate.providers.find(provider =>
          provider.name === 'aws'
        );
        if (!aws_provider) return [];

        return aws_provider.permissions
          .filter(permission =>
            state.mode === 'full' || permission.read_only
          )
          .map(permission => permission.name);
      });

      // Return deduplicated and sorted permissions
      return [...new Set(newPermissions)].sort();
    });
  }

function downloadTemplate() {
    try {
      // Format date for filename
      const date = new Date().toISOString().split('T')[0];
      const filename = `flexera-automation-role-${$flexeraOrgId}-${date}.json`;

      // Create blob from template
      const blob = new Blob([$cloudFormationTemplate], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download template:', error);
      alert('Failed to download template. Please try again.');
    }
  }

  function saveState() {
    const state = {
      orgId: $flexeraOrgId,
      zone: $flexeraZone,
      policyStates: $policyStates,
      permissions: $permissions,
    };

    const stateStr = btoa(JSON.stringify(state));
    const url = new URL(window.location.href);
    url.searchParams.set('state', stateStr);
    pushState(url.toString(), {});
    return url.toString();
  }

  function loadState(stateStr?: string) {
    try {
      // Get state from URL if not provided
      if (!stateStr) {
        const url = new URL(window.location.href);
        stateStr = url.searchParams.get('state') || '';
      }

      if (!stateStr) return false;

      const state = JSON.parse(atob(stateStr));
      flexeraOrgId.set(state.orgId);
      flexeraZone.set(state.zone);
      policyStates.set(state.policyStates);
      permissions.set(state.permissions);

      return true;
    } catch (error) {
      console.error('Failed to load state:', error);
      return false;
    }
  }

  function resetState() {
    // Reset permissions
    permissions.set([]);
    // Reset selected policy permissions
    selectedPolicies.set({});
    resetAllTemplates();
  }

  $: {
    if ($permissions) {
      updateCloudFormationTemplate($permissions);
    }
  }

  // Update the existing updateCloudFormationTemplate function
  function updateCloudFormationTemplate(currentPermissions: string[]) {
    if (!$flexeraOrgId || !isValidOrgId) {
      let template = "Please enter Flexera Organization ID";
      cloudFormationTemplate.set(template);
      return;
    };
    // Get date in YYY
    var today = new Date()
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
    // Convert permissions to CFT format
    const template = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'Generated by Flexera Automation CloudFormation Template Generator on ' + date,
      Resources: {
        FlexeraAutomationAccessRole: {
          Type: 'AWS::IAM::Role',
          Properties: {
            RoleName: 'FlexeraAutomationAccessRole',
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    AWS: TrustedRoleMap[$flexeraZone].roleArn
                  },
                  Action: 'sts:AssumeRole',
                  Condition: {
                    StringEquals: {
                      'sts:ExternalId': $flexeraOrgId
                    }
                  }
                }
              ]
            }
          }
        },
        FlexeraAutomationAccessRolePolicyDocument: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyName: 'FlexeraAutomationAccessRolePolicy',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: currentPermissions,
                  Resource: '*',
                },
              ],
            },
            Roles: [
              {
                Ref: 'FlexeraAutomationAccessRole',
              },
            ],
          }
        }
      }
    };
    cloudFormationTemplate.set(JSON.stringify(template, null, 2));
  }
</script>

<style>
  /* Add your styles here */
  .policy-list {
    margin: 20px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  th {
    background-color: #f2f2f2;
  }
</style>

<div class="p-6 bg-gray-50 border-b border-gray-200">
  <div class="max-w-4xl mx-auto flex flex-col gap-4">
    <h2 class="text-xl font-semibold text-gray-800">Flexera Configuration</h2>

    <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-col">
        <label for="orgId" class="text-sm font-medium text-gray-700 mb-1">
          Flexera Organization ID *
        </label>
        <input
          id="orgId"
          type="text"
          bind:value={$flexeraOrgId}
          on:change={() => updateCloudFormationTemplate($permissions)}
          placeholder="123456"
          class="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500
                 {!isValidOrgId && $flexeraOrgId ? 'border-red-500' : 'border-gray-300'}"
          required
        />
        {#if $flexeraOrgId && !isValidOrgId}
          <p class="text-red-500 text-sm mt-1">Please enter a valid numeric Organization ID.  Should be a numeric value and can be retrieved from the URL when logged into Flexera UI</p>
        {/if}
      </div>

      <div class="flex flex-col">
        <label for="zone" class="text-sm font-medium text-gray-700 mb-1">
          Flexera Zone *
        </label>
        <select
          id="zone"
          bind:value={$flexeraZone}
          on:change={() => updateCloudFormationTemplate($permissions)}
          class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          required
        >
          {#each zoneOptions as zone}
            <option value={zone}>{zone}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
</div>

<div class="flex">
  <!-- Existing left column -->
  <div class="w-1/2 p-6">
    <h2 class="text-2xl font-bold mb-4 text-gray-800">Permissions Granted</h2>
    {#each policyTemplates as { name }}
      <div class="flex items-center space-x-2 mb-2">
        <input
          type="checkbox"
          class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          bind:group={selectedPolicies[name]}
        />
        <label class="text-gray-700">{name}</label>
      </div>
    {/each}

    <pre class="bg-gray-50 p-4 rounded-lg overflow-auto mb-4 text-sm">{JSON.stringify($permissions, null, 2)}</pre>

    <div class="flex flex-wrap gap-2 mb-8">
      <button class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors" on:click={downloadTemplate}>Download Template</button>
      <button
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        on:click={() => {
          const url = saveState();
          // Copy URL to clipboard
          navigator.clipboard.writeText(url);
        }}
      >
        Save State & Copy URL
      </button>
      <button class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors" on:click={resetState}>Reset</button>
    </div>
  </div>

  <!-- New right column -->
  <div class="w-1/2 p-6 border-l border-gray-200">
    <h2 class="text-2xl font-bold mb-4 text-gray-800">CloudFormation Template</h2>
    <div class="relative">
      <pre class="bg-gray-50 p-4 rounded-lg overflow-auto mb-4 text-sm h-[calc(100vh-200px)]">{$cloudFormationTemplate}</pre>
      <button
      class="absolute top-2 right-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
      on:click={() => {
        navigator.clipboard.writeText($cloudFormationTemplate);
      }}
      >
      Copy
      </button>
    </div>
  </div>
</div>

<div class="policy-list p-6">

  <div class="flex justify-between items-center mb-4">
    <h2 class="text-2xl font-bold text-gray-800">AWS Policy Templates</h2>

    <div class="flex gap-4 items-center">
      <!-- Search input -->
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search templates..."
        class="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      />

      <!-- Bulk action buttons -->
      <div class="flex gap-2">
        <button
          class="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
          on:click={() => updateAllTemplates('disabled')}>
          Disable All Visible
        </button>
        <button
          class="px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors text-sm"
          on:click={() => updateAllTemplates('readonly')}>
          Read Only All Visible
        </button>
        <button
          class="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
          on:click={() => updateAllTemplates('full')}>
          Full Access All Visible
        </button>
      </div>
    </div>
  </div>
  {#if filteredTemplates.length > 0 && isValidOrgId }
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {#each filteredTemplates as template}
          <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{template.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{template.description || 'No description available'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              <select
                class="border border-gray-300 rounded p-2"
                data-template={template.name}
                value={$policyStates[template.name] ? $policyStates[template.name].mode : 'disabled'}
                on:change={(e) => togglePolicy(template.name, e.target.value)}
              >
                <option value="disabled">Disabled</option>
                <option value="readonly">Read Only</option>
                {#if template.providers && template.providers.some(provider =>
                  provider.permissions.some(permission => !permission.read_only))}
                  <option value="full">Full Access</option>
                {/if}
              </select>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    {#if !isValidOrgId}
      <p class="text-red-500 text-center py-4">Please enter a valid numeric Organization ID</p>
    {:else if awsTemplates.length === 0}
      <p class="text-gray-500 text-center py-4">Loading templates...</p>
    {:else}
      <p class="text-gray-500 text-center py-4">No policy templates found containing '{searchQuery}'</p>
    {/if}
  {/if}
</div>
