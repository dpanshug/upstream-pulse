import { useQuery } from '@tanstack/react-query';
import { Folder, ExternalLink } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function fetchProjects() {
  const res = await fetch(`${API_URL}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export default function Projects() {
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Projects</h1>

        {isLoading ? (
          <p>Loading projects...</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Ecosystem
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Repository
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data?.projects?.map((project: any) => (
                  <tr key={project.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Folder className="w-5 h-5 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-900">
                          {project.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {project.ecosystem}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={`https://github.com/${project.githubOrg}/${project.githubRepo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                      >
                        {project.githubOrg}/{project.githubRepo}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          project.trackingEnabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {project.trackingEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(!data?.projects || data.projects.length === 0) && (
              <div className="text-center py-12">
                <Folder className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No projects configured yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
